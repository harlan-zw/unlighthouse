import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import lighthousePackage from 'lighthouse/package.json' with { type: 'json' }
import type { Config } from '../config.ts'
import { defaultConcurrency } from '../config.ts'
import { UnlighthouseError } from '../errors.ts'
import { chromeArgs, explainChromeFailure, findChrome, needsNoSandbox } from './chrome.ts'

export type CheckStatus = 'ok' | 'warn' | 'fail'

export interface DoctorCheck {
  id: 'chrome' | 'chrome-launch' | 'bun' | 'lighthouse' | 'data-dir' | 'cpu'
  status: CheckStatus
  label: string
  detail: string
  fix?: string
}

export interface DoctorReport {
  ok: boolean
  checks: DoctorCheck[]
  chromePath: string | null
  chromeVersion: string | null
  cpus: number
  recommendedConcurrency: number
}

const MIN_BUN = [1, 4, 0]
const LAUNCH_TIMEOUT_MS = 30_000

function atLeast(version: string, minimum: number[]): boolean {
  const parts = version.split(/[.-]/).map(part => Number.parseInt(part, 10))
  for (let i = 0; i < minimum.length; i++) {
    const have = parts[i] ?? 0
    const want = minimum[i] ?? 0
    if (have !== want)
      return have > want
  }
  return true
}

async function run(command: string[], timeoutMs: number): Promise<{ code: number | null, stdout: string, stderr: string, timedOut: boolean }> {
  const proc = Bun.spawn(command, { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    proc.kill('SIGKILL')
  }, timeoutMs)
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  await proc.exited
  clearTimeout(timer)
  return { code: proc.exitCode, stdout, stderr, timedOut }
}

async function checkLaunch(chromePath: string, config: Config): Promise<DoctorCheck> {
  const sandbox = needsNoSandbox() || config.chromeFlags.includes('--no-sandbox')
    ? `sandbox off (${process.getuid?.() === 0 ? 'running as root' : config.chromeFlags.includes('--no-sandbox') ? '--no-sandbox in chromeFlags' : 'UNLIGHTHOUSE_NO_SANDBOX=1'})`
    : 'sandbox on'
  const profile = mkdtempSync(join(tmpdir(), 'unlighthouse-doctor-'))
  try {
    const result = await run([chromePath, ...chromeArgs(config.chromeFlags), `--user-data-dir=${profile}`, '--dump-dom', 'about:blank'], LAUNCH_TIMEOUT_MS)
    if (result.code === 0 && /<html/i.test(result.stdout))
      return { id: 'chrome-launch', status: 'ok', label: 'Headless Chrome', detail: `starts headless, ${sandbox}` }
    if (result.timedOut)
      return { id: 'chrome-launch', status: 'fail', label: 'Headless Chrome', detail: `did not finish loading about:blank within ${LAUNCH_TIMEOUT_MS / 1000} s`, fix: 'Check that the machine is not overloaded and that Chrome runs from a terminal with --headless=new.' }
    const explanation = explainChromeFailure(result.stderr)
    return { id: 'chrome-launch', status: 'fail', label: 'Headless Chrome', detail: `exited with code ${result.code}, ${sandbox}`, fix: explanation }
  }
  finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

function checkDataDir(config: Config): DoctorCheck {
  const dir = resolve(config.dataDir)
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.doctor-${process.pid}`)
    writeFileSync(probe, 'ok')
    rmSync(probe, { force: true })
    return { id: 'data-dir', status: 'ok', label: 'Data directory', detail: `${dir} is writable` }
  }
  catch (error) {
    return { id: 'data-dir', status: 'fail', label: 'Data directory', detail: `${dir} is not writable: ${error instanceof Error ? error.message : String(error)}`, fix: 'Point dataDir at a directory the current user can write, or fix its permissions.' }
  }
}

export async function doctor(config: Config): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  let chromePath: string | null = null
  let chromeVersion: string | null = null

  try {
    chromePath = findChrome(config.chromePath)
    const version = await run([chromePath, '--version'], 10_000)
    chromeVersion = version.stdout.trim() || null
    checks.push({ id: 'chrome', status: 'ok', label: 'Chrome', detail: `${chromeVersion ?? 'unknown version'} at ${chromePath}` })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    checks.push({ id: 'chrome', status: 'fail', label: 'Chrome', detail: message, ...(error instanceof UnlighthouseError && error.code === 'CHROME_NOT_FOUND' ? { fix: 'Install Chrome or set CHROME_PATH.' } : {}) })
  }
  if (chromePath)
    checks.push(await checkLaunch(chromePath, config))

  checks.push(atLeast(Bun.version, MIN_BUN)
    ? { id: 'bun', status: 'ok', label: 'Bun', detail: Bun.version }
    : { id: 'bun', status: 'fail', label: 'Bun', detail: `${Bun.version} is too old`, fix: `Upgrade to Bun ${MIN_BUN.join('.')} or newer: \`bun upgrade\`.` })

  checks.push({ id: 'lighthouse', status: 'ok', label: 'Lighthouse', detail: lighthousePackage.version })
  checks.push(checkDataDir(config))

  const cpus = availableParallelism()
  const recommendedConcurrency = defaultConcurrency(cpus, config.throttling)
  const cpuCheck: DoctorCheck = { id: 'cpu', status: 'ok', label: 'CPU', detail: `${cpus} CPUs, recommended concurrency ${recommendedConcurrency} for ${config.throttling} throttling` }
  if (config.concurrency !== undefined && config.concurrency > recommendedConcurrency) {
    cpuCheck.status = 'warn'
    cpuCheck.detail += `; configured concurrency ${config.concurrency} is higher`
    cpuCheck.fix = `Performance scores get noisier when Lighthouse runs compete for CPU. Use concurrency ${recommendedConcurrency} or less for trustworthy performance numbers.`
  }
  checks.push(cpuCheck)

  return {
    ok: checks.every(check => check.status !== 'fail'),
    checks,
    chromePath,
    chromeVersion,
    cpus,
    recommendedConcurrency,
  }
}
