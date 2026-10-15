import { renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import lighthouse from 'lighthouse'
import type { Result } from 'lighthouse'
import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'
import type { RunnerConfig } from '../config.ts'
import type { AuditJob } from '../contracts.ts'
import { injectAuth } from './auth.ts'
import { findChrome, launchChrome } from './chrome.ts'
import { lighthouseConfig, lighthouseFlags } from './lighthouse.ts'
import type { WorkerOutcome } from './protocol.ts'
import { classifyLighthouseError, JOB_FILE, PROFILE_DIR, REPORT_FILE, RESULT_FILE, THUMBNAIL_FILE } from './protocol.ts'
import { runPsi } from './psi.ts'
import type { PsiRunner } from './psi.ts'
import { finalScreenshot, medianRun, reconcile, runtimeError, sampleSpread } from './reconcile.ts'
import { makeThumbnail } from './thumbnail.ts'

type Failure = Extract<WorkerOutcome, { ok: false }>
type Runs = { ok: true, runs: Result[] } | Failure

function failure(error: unknown): Failure {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'WORKER_ERROR'
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, kind: classifyLighthouseError(code), code, message }
}

function runtimeFailure(lhr: Result): Failure | null {
  const error = runtimeError(lhr)
  return error ? { ok: false, kind: classifyLighthouseError(error.code), code: error.code, message: error.message } : null
}

async function lighthouseRuns(job: AuditJob, browser: Browser): Promise<Runs> {
  const page = await browser.newPage()
  try {
    await injectAuth(browser, page, job.auth, job.url)
    const flags = lighthouseFlags(job)
    const config = lighthouseConfig(job)
    const runs: Result[] = []
    for (let sample = 0; sample < job.samples; sample++) {
      const runner = await lighthouse(job.url, flags, config, page)
      if (!runner)
        throw new Error('Lighthouse returned no result')
      const failed = runtimeFailure(runner.lhr)
      if (failed)
        return failed
      runs.push(runner.lhr)
    }
    return { ok: true, runs }
  }
  finally {
    await page.close().catch(() => {})
  }
}

async function localRuns(job: AuditJob, dir: string): Promise<Runs> {
  const chrome = await launchChrome({
    chromePath: job.chromePath ?? findChrome(),
    flags: job.chromeFlags,
    userDataDir: join(dir, PROFILE_DIR),
    sharedGroup: true,
  })
  let browser: Browser | undefined
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null })
    return await lighthouseRuns(job, browser)
  }
  finally {
    await browser?.disconnect().catch(() => {})
    await chrome.kill()
  }
}

async function remoteRuns(job: AuditJob, runner: Extract<RunnerConfig, { type: 'cdp' }>): Promise<Runs> {
  const endpoint = runner.endpoint.startsWith('ws') ? { browserWSEndpoint: runner.endpoint } : { browserURL: runner.endpoint }
  let browser: Browser
  try {
    browser = await puppeteer.connect({ ...endpoint, defaultViewport: null, wsOptions: { headers: runner.headers, keepAlive: true } })
  }
  catch (error) {
    return { ok: false, kind: 'infra', code: 'CDP_CONNECT_FAILED', message: `Could not connect to the remote Chrome at ${new URL(runner.endpoint).host}: ${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    return await lighthouseRuns(job, browser)
  }
  finally {
    await browser.disconnect().catch(() => {})
  }
}

async function psiRuns(job: AuditJob, runner: PsiRunner): Promise<Runs> {
  const apiKey = process.env[runner.apiKeyEnv]
  if (!apiKey)
    return { ok: false, kind: 'page', code: 'PSI_NO_KEY', message: `Set ${runner.apiKeyEnv} to a PageSpeed Insights API key` }
  const runs: Result[] = []
  for (let sample = 0; sample < job.samples; sample++) {
    const outcome = await runPsi(job, runner, { apiKey })
    if (!outcome.ok)
      return outcome
    const failed = runtimeFailure(outcome.lhr)
    if (failed)
      return failed
    runs.push(outcome.lhr)
  }
  return { ok: true, runs }
}

export async function runJob(job: AuditJob, dir: string): Promise<WorkerOutcome> {
  const started = performance.now()
  if (job.cwd)
    process.chdir(job.cwd)
  const runner = job.runner ?? { type: 'local' }
  const collected = runner.type === 'psi'
    ? await psiRuns(job, runner)
    : runner.type === 'cdp'
      ? await remoteRuns(job, runner)
      : await localRuns(job, dir)
  if (!collected.ok)
    return collected

  const median = medianRun(collected.runs)
  const reconciled = reconcile(median, job, sampleSpread(collected.runs))
  await Bun.write(join(dir, REPORT_FILE), Bun.gzipSync(JSON.stringify(median)))
  const thumbnail = await makeThumbnail(finalScreenshot(median))
  if (thumbnail)
    await Bun.write(join(dir, THUMBNAIL_FILE), thumbnail)
  return { ok: true, result: { ...reconciled, durationMs: Math.round(performance.now() - started) } }
}

export async function runWorker(dir: string): Promise<never> {
  const parent = process.ppid
  setInterval(() => {
    try {
      process.kill(parent, 0)
      return
    }
    catch {}
    rmSync(dir, { recursive: true, force: true })
    process.kill(-process.pid, 'SIGKILL')
  }, 1000).unref()
  let outcome: WorkerOutcome
  try {
    const job = await Bun.file(join(dir, JOB_FILE)).json() as AuditJob
    outcome = await runJob(job, dir)
  }
  catch (error) {
    outcome = failure(error)
  }
  await Bun.write(join(dir, `${RESULT_FILE}.tmp`), JSON.stringify(outcome))
  renameSync(join(dir, `${RESULT_FILE}.tmp`), join(dir, RESULT_FILE))
  process.exit(0)
}

if (import.meta.main) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: bun src/audit/worker.ts <job-dir>')
    process.exit(2)
  }
  await runWorker(dir)
}
