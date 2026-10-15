import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Subprocess } from 'bun'
import type { LighthouseOptions, RunnerConfig } from '../config.ts'
import type { AuditJob, AuditPool, AuditResult } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import { findChrome } from './chrome.ts'
import { resolvePlugins } from './lighthouse.ts'
import type { FailureKind, WorkerOutcome } from './protocol.ts'
import { JOB_FILE, REPORT_FILE, RESULT_FILE, THUMBNAIL_FILE, WORKER_DIR_PREFIX } from './protocol.ts'

const WORKER = fileURLToPath(new URL('./worker.ts', import.meta.url))
export const WORKER_COMMAND = '__worker'
const STDERR_TAIL = 2000

export interface AuditPoolOptions {
  concurrency: number
  retries: number
}

export interface AuditSetup {
  runner?: RunnerConfig | undefined
  lighthouse?: LighthouseOptions | undefined
  chromePath?: string | undefined
  auth: {
    headers: Record<string, string>
    cookies: unknown[]
    localStorage: Record<string, string>
    sessionStorage: Record<string, string>
    login?: string | undefined
  }
}

export function checkAuditSetup(setup: AuditSetup, cwd = process.cwd()): { chromePath?: string } {
  const runner = setup.runner ?? { type: 'local' }
  const options = setup.lighthouse ?? {}
  if (runner.type === 'psi') {
    if (!process.env[runner.apiKeyEnv])
      throw new UnlighthouseError('INVALID_CONFIG', `The psi runner needs a PageSpeed Insights API key in the ${runner.apiKeyEnv} environment variable`)
    const { headers, cookies, localStorage, sessionStorage, login } = setup.auth
    if (login || cookies.length || [headers, localStorage, sessionStorage].some(record => Object.keys(record).length))
      throw new UnlighthouseError('INVALID_CONFIG', 'The psi runner audits the public page from Google\'s servers and cannot apply auth headers, cookies, storage or a login script; use the local or cdp runner for private pages')
    const unsupported = (['skipAudits', 'onlyAudits', 'plugins', 'settings'] as const).filter(key => options[key] !== undefined)
    if (unsupported.length)
      throw new UnlighthouseError('INVALID_CONFIG', `The psi runner cannot apply ${unsupported.map(key => `lighthouse.${key}`).join(', ')}; PageSpeed Insights runs its own Lighthouse configuration`)
    return {}
  }
  if (options.plugins?.length)
    resolvePlugins(options.plugins, cwd)
  if (runner.type === 'cdp')
    return {}
  return { chromePath: findChrome(setup.chromePath) }
}

type Attempt =
  | { ok: true, result: AuditResult }
  | { ok: false, kind: FailureKind, code: string, message: string }

interface Waiter {
  grant: () => void
  reject: (error: unknown) => void
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The audit was aborted', 'AbortError')
}

export async function tail(stream: ReadableStream<Uint8Array>): Promise<string> {
  let text = ''
  const decoder = new TextDecoder()
  try {
    for await (const chunk of stream) {
      text += decoder.decode(chunk, { stream: true })
      if (text.length > STDERR_TAIL * 2)
        text = text.slice(-STDERR_TAIL)
    }
  }
  catch {}
  return text.slice(-STDERR_TAIL).trim()
}

export function killGroup(pid: number): void {
  try {
    process.kill(-pid, 'SIGKILL')
  }
  catch {}
}

export function createAuditPool(options: AuditPoolOptions): AuditPool {
  const size = Math.max(1, Math.floor(options.concurrency))
  const retries = Math.max(0, Math.floor(options.retries))
  const waiting: Waiter[] = []
  const running = new Set<Subprocess>()
  let active = 0
  let closed = false

  function acquire(signal?: AbortSignal): Promise<void> {
    if (closed)
      return Promise.reject(new UnlighthouseError('AUDIT_FAILED', 'The audit pool is closed'))
    if (signal?.aborted)
      return Promise.reject(abortReason(signal))
    if (active < size) {
      active++
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = waiting.indexOf(waiter)
        if (index >= 0)
          waiting.splice(index, 1)
        reject(abortReason(signal!))
      }
      const waiter: Waiter = {
        grant: () => {
          signal?.removeEventListener('abort', onAbort)
          resolve()
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      waiting.push(waiter)
    })
  }

  function release(): void {
    const next = waiting.shift()
    if (next)
      next.grant()
    else
      active--
  }

  async function attempt(job: AuditJob, signal?: AbortSignal): Promise<Attempt> {
    const dir = mkdtempSync(join(tmpdir(), WORKER_DIR_PREFIX))
    try {
      writeFileSync(join(dir, JOB_FILE), JSON.stringify(job))
      const proc = Bun.spawn([process.execPath, Bun.isStandaloneExecutable ? WORKER_COMMAND : WORKER, dir], {
        env: { ...process.env },
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'pipe',
        detached: true,
      })
      running.add(proc)
      const stderr = tail(proc.stderr)
      const limitMs = job.timeoutMs * job.samples
      let stopped: 'timeout' | 'aborted' | null = null
      const timer = setTimeout(() => {
        stopped ??= 'timeout'
        killGroup(proc.pid)
      }, limitMs)
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
        running.delete(proc)
      }

      if (stopped === 'aborted')
        throw abortReason(signal!)
      if (stopped === 'timeout')
        return { ok: false, kind: 'infra', code: 'TIMEOUT', message: `no result within ${limitMs} ms (timeoutMs ${job.timeoutMs} × ${job.samples} samples); the worker and its Chrome were killed` }

      const resultPath = join(dir, RESULT_FILE)
      if (!existsSync(resultPath)) {
        const output = await stderr
        return { ok: false, kind: 'infra', code: 'WORKER_CRASHED', message: `the audit worker exited with code ${proc.exitCode ?? proc.signalCode} without a result${output ? `: ${output}` : ''}` }
      }
      const outcome = JSON.parse(readFileSync(resultPath, 'utf8')) as WorkerOutcome
      if (!outcome.ok)
        return outcome
      const thumbnailPath = join(dir, THUMBNAIL_FILE)
      return {
        ok: true,
        result: {
          ...outcome.result,
          report: new Uint8Array(readFileSync(join(dir, REPORT_FILE))),
          thumbnail: existsSync(thumbnailPath) ? new Uint8Array(readFileSync(thumbnailPath)) : null,
        },
      }
    }
    finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }

  async function run(job: AuditJob, signal?: AbortSignal): Promise<AuditResult> {
    const cwd = job.cwd ?? process.cwd()
    const prepared: AuditJob = { ...job, ...checkAuditSetup(job, cwd), cwd }
    await acquire(signal)
    try {
      let last: Extract<Attempt, { ok: false }> | null = null
      const attempts = retries + 1
      for (let n = 1; n <= attempts; n++) {
        if (closed)
          throw new UnlighthouseError('AUDIT_FAILED', 'The audit pool is closed')
        const outcome = await attempt(prepared, signal)
        if (outcome.ok)
          return outcome.result
        last = outcome
        if (outcome.kind === 'page')
          throw new UnlighthouseError('AUDIT_FAILED', `Lighthouse could not audit ${job.url} (${job.device}): ${outcome.message}`, { code: outcome.code, kind: outcome.kind, attempts: n })
      }
      throw new UnlighthouseError('AUDIT_FAILED', `Lighthouse could not audit ${job.url} (${job.device}) after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${last?.message}`, { code: last?.code, kind: last?.kind, attempts })
    }
    finally {
      release()
    }
  }

  async function close(): Promise<void> {
    closed = true
    for (const waiter of waiting.splice(0))
      waiter.reject(new UnlighthouseError('AUDIT_FAILED', 'The audit pool is closed'))
    const procs = [...running]
    for (const proc of procs)
      killGroup(proc.pid)
    await Promise.all(procs.map(proc => proc.exited))
  }

  return { size, run, close }
}
