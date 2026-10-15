import { spawn } from 'node:child_process'
import type { SpawnOptions } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Launcher } from 'chrome-launcher'
import { UnlighthouseError } from '../errors.ts'

export const CHROME_INSTALL_HINT = 'Install Google Chrome or Chromium (or Chrome for Testing: `bunx @puppeteer/browsers install chrome@stable`) and point Unlighthouse at it with CHROME_PATH=/path/to/chrome or the chromePath option.'

export function findChrome(chromePath?: string): string {
  const envPath = process.env['CHROME_PATH']
  const explicit = chromePath ?? (envPath ? envPath : undefined)
  if (explicit) {
    if (!existsSync(explicit))
      throw new UnlighthouseError('CHROME_NOT_FOUND', `Chrome not found at ${explicit} (from ${chromePath ? 'chromePath' : 'CHROME_PATH'}). ${CHROME_INSTALL_HINT}`)
    return explicit
  }
  let detected: string | undefined
  try {
    detected = Launcher.getFirstInstallation()
  }
  catch {}
  if (!detected)
    throw new UnlighthouseError('CHROME_NOT_FOUND', `No Chrome or Chromium installation found. ${CHROME_INSTALL_HINT}`)
  return detected
}

export function needsNoSandbox(): boolean {
  return process.getuid?.() === 0 || process.env['UNLIGHTHOUSE_NO_SANDBOX'] === '1'
}

export function chromeArgs(extra: string[] = []): string[] {
  const args = ['--headless=new', '--disable-crash-reporter']
  if (needsNoSandbox() && !extra.includes('--no-sandbox'))
    args.push('--no-sandbox')
  return [...args, ...extra]
}

export function explainChromeFailure(output: string): string {
  const library = output.match(/error while loading shared libraries: ([^:\s]+)/)
  if (library)
    return `Chrome cannot start because the system library ${library[1]} is missing. Install Chrome's runtime dependencies (Debian/Ubuntu: \`apt-get install -y google-chrome-stable\` pulls them in, or install libnss3 libatk-bridge2.0-0 libgbm1 libasound2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libpango-1.0-0 libcairo2 libcups2).`
  if (/no usable sandbox|running as root without --no-sandbox|setuid sandbox|namespace sandbox|sandbox_host_linux|credentials\.cc/i.test(output))
    return 'Chrome\'s sandbox cannot start here (common in Docker, CI containers and when running as root). Run Unlighthouse as a non-root user with unprivileged user namespaces enabled, or set UNLIGHTHOUSE_NO_SANDBOX=1 to launch Chrome with --no-sandbox on a machine you trust.'
  if (/dev\/shm|shared memory/i.test(output))
    return 'Chrome ran out of shared memory (/dev/shm is too small, common in Docker). Start the container with --shm-size=1g or add --disable-dev-shm-usage to chromeFlags.'
  const lines = output.split('\n').map(line => line.trim()).filter(Boolean)
  return lines.length ? `Chrome failed to start: ${lines.slice(-5).join(' | ')}` : 'Chrome failed to start without printing an error.'
}

export interface ChromeProcess {
  readonly pid: number
  readonly port: number
  kill(): Promise<void>
}

export interface LaunchOptions {
  chromePath: string
  flags?: string[]
  userDataDir?: string
  sharedGroup?: boolean
}

const sharedGroupSpawn = ((command: string, args: readonly string[], spawnOptions: SpawnOptions) =>
  spawn(command, args, { ...spawnOptions, detached: false })) as typeof spawn

export async function launchChrome(options: LaunchOptions): Promise<ChromeProcess> {
  const ownDir = options.userDataDir === undefined
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'unlighthouse-chrome-'))
  mkdirSync(userDataDir, { recursive: true })
  const launcher = new Launcher({
    chromePath: options.chromePath,
    chromeFlags: chromeArgs(options.flags),
    userDataDir,
    logLevel: 'silent',
    handleSIGINT: false,
  }, options.sharedGroup ? { spawn: sharedGroupSpawn } : {})

  const launching = launcher.launch()
  const child = launcher.chromeProcess
  const exited = new Promise<never>((_, reject) => {
    child?.once('exit', code => reject(new Error(`exit ${code}`)))
  })
  exited.catch(() => {})

  const killTree = async () => {
    const pid = launcher.pid ?? child?.pid
    if (pid) {
      try {
        process.kill(options.sharedGroup ? pid : -pid, 'SIGKILL')
      }
      catch {}
      if (child && child.exitCode === null && child.signalCode === null)
        await new Promise(resolve => child.once('exit', resolve))
    }
    if (ownDir)
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }

  try {
    await Promise.race([launching, exited])
  }
  catch (error) {
    let stderr = ''
    try {
      stderr = readFileSync(join(userDataDir, 'chrome-err.log'), 'utf8')
    }
    catch {}
    await killTree()
    throw new Error(explainChromeFailure(stderr || (error instanceof Error ? error.message : String(error))))
  }

  if (!launcher.pid || !launcher.port) {
    await killTree()
    throw new Error('Chrome started but did not report a debugging port.')
  }
  return { pid: launcher.pid, port: launcher.port, kill: killTree }
}
