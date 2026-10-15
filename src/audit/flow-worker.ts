import { renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { startFlow } from 'lighthouse'
import type { UserFlow } from 'lighthouse'
import defaultConfig from 'lighthouse/core/config/default-config.js'
import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'
import type { FlowJob } from '../contracts.ts'
import type { Category, FlowStepMode } from '../types.ts'
import { injectAuth } from './auth.ts'
import { findChrome, launchChrome } from './chrome.ts'
import type { FlowContext, FlowOutcome } from './flow.ts'
import { lighthouseConfig, lighthouseFlags } from './lighthouse.ts'
import { JOB_FILE, PROFILE_DIR, REPORT_FILE, RESULT_FILE } from './protocol.ts'
import { flowLighthouseVersion, reconcileFlow } from './reconcile.ts'

type StepFlags = UserFlow.StepFlags

class FlowScriptError extends Error {
  code = 'FLOW_SCRIPT_FAILED'
}

export function categoriesForMode(categories: Category[], mode: FlowStepMode): Category[] {
  const supported = categories.filter((category) => {
    const modes = defaultConfig.categories?.[category]?.supportedModes
    return !modes || modes.includes(mode)
  })
  return supported.length ? supported : ['performance']
}

function withCategories(flags: StepFlags | undefined, categories: Category[], mode: FlowStepMode): StepFlags {
  if (flags?.onlyCategories)
    return flags
  return { ...flags, onlyCategories: categoriesForMode(categories, mode) }
}

function scopedFlow(flow: UserFlow, categories: Category[]): UserFlow {
  return new Proxy(flow, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function')
        return value
      switch (property) {
        case 'navigate':
          return (requestor: Parameters<UserFlow['navigate']>[0], flags?: StepFlags) => target.navigate(requestor, withCategories(flags, categories, 'navigation'))
        case 'startNavigation':
          return (flags?: StepFlags) => target.startNavigation(withCategories(flags, categories, 'navigation'))
        case 'startTimespan':
          return (flags?: StepFlags) => target.startTimespan(withCategories(flags, categories, 'timespan'))
        case 'snapshot':
          return (flags?: StepFlags) => target.snapshot(withCategories(flags, categories, 'snapshot'))
        default:
          return value.bind(target)
      }
    },
  })
}

async function loadScript(module: string): Promise<(context: FlowContext) => unknown> {
  let mod: { default?: unknown }
  try {
    mod = await import(pathToFileURL(module).href) as { default?: unknown }
  }
  catch (error) {
    throw new FlowScriptError(`Cannot load the flow module ${module}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof mod.default !== 'function')
    throw new FlowScriptError(`The flow module ${module} has no default export function`)
  return mod.default as (context: FlowContext) => unknown
}

export async function runFlowJob(job: FlowJob, dir: string): Promise<FlowOutcome> {
  const started = performance.now()
  const script = await loadScript(job.module)
  const chrome = await launchChrome({
    chromePath: job.chromePath ?? findChrome(),
    flags: job.chromeFlags,
    userDataDir: join(dir, PROFILE_DIR),
    sharedGroup: true,
  })
  let browser: Browser | undefined
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null })
    const page = await browser.newPage()
    await injectAuth(browser, page, job.auth, job.url)
    const config = lighthouseConfig(job)
    const flow = await startFlow(page, {
      name: job.name,
      flags: lighthouseFlags({ ...job, categories: categoriesForMode(job.categories, 'navigation') }),
      ...(config ? { config } : {}),
    })
    try {
      await script({ flow: scopedFlow(flow, job.categories), page, url: job.url, device: job.device })
    }
    catch (error) {
      throw new FlowScriptError(`The flow ${job.name} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!flow.createArtifactsJson().gatherSteps.length)
      throw new FlowScriptError(`The flow ${job.name} ran no Lighthouse step; call flow.navigate, flow.startTimespan/endTimespan or flow.snapshot`)
    const result = await flow.createFlowResult()
    await Bun.write(join(dir, REPORT_FILE), Bun.gzipSync(JSON.stringify(result)))
    return {
      ok: true,
      result: {
        name: job.name,
        device: job.device,
        startUrl: job.url,
        lighthouseVersion: flowLighthouseVersion(result),
        steps: reconcileFlow(result, job),
        durationMs: Math.round(performance.now() - started),
      },
    }
  }
  finally {
    await browser?.disconnect().catch(() => {})
    await chrome.kill()
  }
}

export async function runFlowWorker(dir: string): Promise<never> {
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
  let outcome: FlowOutcome
  try {
    const job = await Bun.file(join(dir, JOB_FILE)).json() as FlowJob
    outcome = await runFlowJob(job, dir)
  }
  catch (error) {
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'WORKER_ERROR'
    outcome = { ok: false, code, message: error instanceof Error ? error.message : String(error) }
  }
  await Bun.write(join(dir, `${RESULT_FILE}.tmp`), JSON.stringify(outcome))
  renameSync(join(dir, `${RESULT_FILE}.tmp`), join(dir, RESULT_FILE))
  process.exit(0)
}

if (import.meta.main) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: bun src/audit/flow-worker.ts <job-dir>')
    process.exit(2)
  }
  await runFlowWorker(dir)
}
