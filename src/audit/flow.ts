import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserFlow } from 'lighthouse'
import type { Page } from 'puppeteer-core'
import type { Config, FlowConfig } from '../config.ts'
import type { AuthState, FlowJob, FlowRunResult } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import type { Device } from '../types.ts'
import { findChrome } from './chrome.ts'
import { killGroup, tail } from './pool.ts'
import { JOB_FILE, REPORT_FILE, RESULT_FILE } from './protocol.ts'

const WORKER = fileURLToPath(new URL('./flow-worker.ts', import.meta.url))
export const FLOW_WORKER_COMMAND = '__flow-worker'
export const FLOW_DIR_PREFIX = 'unlighthouse-flow-'

export interface FlowContext {
  flow: UserFlow
  page: Page
  url: string
  device: Device
}

export type FlowScript = (context: FlowContext) => unknown

export type FlowOutcome =
  | { ok: true, result: Omit<FlowRunResult, 'report'> }
  | { ok: false, code: string, message: string }

export function flowJobFor(config: Config, flow: FlowConfig, device: Device, auth: AuthState, cwd = process.cwd()): FlowJob {
  let url: string
  try {
    url = new URL(flow.url ?? config.site ?? '', config.site).href
  }
  catch {
    throw new UnlighthouseError('INVALID_CONFIG', `The flow ${flow.name} has no valid start URL: set site, or url on the flow`)
  }
  return {
    name: flow.name,
    module: isAbsolute(flow.module) ? flow.module : resolve(cwd, flow.module),
    url,
    device,
    categories: config.categories,
    throttling: config.throttling,
    timeoutMs: flow.timeoutMs ?? config.timeoutMs,
    chromeFlags: config.chromeFlags,
    auth,
    ...(config.userAgent ? { userAgent: config.userAgent } : {}),
    ...(config.chromePath ? { chromePath: config.chromePath } : {}),
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The flow was aborted', 'AbortError')
}

export async function runFlow(job: FlowJob, signal?: AbortSignal): Promise<FlowRunResult> {
  signal?.throwIfAborted()
  const prepared: FlowJob = { ...job, chromePath: findChrome(job.chromePath) }
  const dir = mkdtempSync(join(tmpdir(), FLOW_DIR_PREFIX))
  try {
    writeFileSync(join(dir, JOB_FILE), JSON.stringify(prepared))
    const proc = Bun.spawn([process.execPath, Bun.isStandaloneExecutable ? FLOW_WORKER_COMMAND : WORKER, dir], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
      detached: true,
    })
    const stderr = tail(proc.stderr)
    let stopped: 'timeout' | 'aborted' | null = null
    const timer = setTimeout(() => {
      stopped ??= 'timeout'
      killGroup(proc.pid)
    }, job.timeoutMs)
    const onAbort = () => {
      stopped ??= 'aborted'
      killGroup(proc.pid)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted)
      onAbort()
    try {
      await proc.exited
    }
    finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      killGroup(proc.pid)
    }

    if (stopped === 'aborted')
      throw abortReason(signal!)
    if (stopped === 'timeout')
      throw new UnlighthouseError('AUDIT_FAILED', `The flow ${job.name} (${job.device}) did not finish within ${job.timeoutMs} ms; the worker and its Chrome were killed`, { code: 'TIMEOUT' })
    const resultPath = join(dir, RESULT_FILE)
    if (!existsSync(resultPath)) {
      const output = await stderr
      throw new UnlighthouseError('AUDIT_FAILED', `The flow worker exited with code ${proc.exitCode ?? proc.signalCode} without a result${output ? `: ${output}` : ''}`, { code: 'WORKER_CRASHED' })
    }
    const outcome = JSON.parse(readFileSync(resultPath, 'utf8')) as FlowOutcome
    if (!outcome.ok)
      throw new UnlighthouseError('AUDIT_FAILED', outcome.message, { code: outcome.code })
    return { ...outcome.result, report: new Uint8Array(readFileSync(join(dir, REPORT_FILE))) }
  }
  finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
