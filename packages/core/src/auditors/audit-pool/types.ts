import type { Hookable } from 'hookable'
import type { Browser, BrowserContext, Page } from 'puppeteer-core'

// ─────────────────────────────────────────────────────────────────────────────
// Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Concurrency strategy. Controls what each worker thread reuses across tasks.
 *
 * Defaults to `browser` for lighthouse — fresh Page per audit, browser reused within the
 * `recycleAfter` window. Reuse-mode `page` is exposed for non-perf-sensitive workloads
 * (e.g. snapshot diffs) but is NOT safe for performance auditing.
 */
export type Concurrency = 'browser' | 'context' | 'page'

/**
 * Audit-pool options. All defaults are tuned for Lighthouse measurement accuracy.
 *
 * The package's whole reason for being is to keep CPU/memory headroom while a Page is audited,
 * so the defaults err on the side of fewer workers + browser recycling over raw throughput.
 */
export interface AuditPoolOptions {
  /** Absolute path to the worker module (default-exports `createWorkerHandler(...)`). */
  workerFile: string
  /** Default: 1. */
  minThreads?: number
  /**
   * Maximum concurrent worker threads. Default: `max(1, floor(availableParallelism() / 2))`.
   *
   * Lighthouse perf scores degrade when audits compete for CPU — halving cores leaves headroom
   * for the audited page (which itself spawns Chrome subprocesses).
   */
  maxThreads?: number
  /** Worker thread idle ms before reap (closes the browser too). Default: 30_000. */
  idleTimeout?: number
  /** Per-task timeout in ms. Default: 90_000 (lighthouse runs can be slow on heavy pages). */
  taskTimeout?: number
  /** Retry failed tasks N times. Default: 1 (catches transient lighthouse flakes). */
  retries?: number
  /**
   * Recycle a worker (kill browser, spawn fresh) after this many tasks. Default: 10.
   * Prevents slow drift in Chrome RAM/CPU between long-running batches.
   */
  recycleAfter?: number
  /** Default: `browser` (fresh Page per task; browser reused within `recycleAfter` window). */
  concurrency?: Concurrency
  /**
   * Bare workers: skip puppeteer.launch entirely; `WorkerTaskContext.browser/context/page` are undefined.
   * Use when the task spawns its own browser (e.g. chrome-launcher for Lighthouse). Default: false.
   */
  bare?: boolean
  /** Forwarded to `puppeteer.launch()` inside each worker. Must be JSON-serializable. */
  puppeteerOptions?: Record<string, unknown>
  /** Arbitrary serializable bag exposed to the worker via `WorkerTaskContext.workerData`. */
  workerData?: Record<string, unknown>
}

/** Resolved options after defaults are applied. */
export interface ResolvedAuditPoolOptions {
  workerFile: string
  minThreads: number
  maxThreads: number
  idleTimeout: number
  taskTimeout: number
  retries: number
  recycleAfter: number
  concurrency: Concurrency
  bare: boolean
  puppeteerOptions: Record<string, unknown>
  workerData: Record<string, unknown>
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver-side hooks + handle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Driver-side hooks. Use `pool.hooks.hook('task:start', fn)`. Hookable supports async listeners
 * and `removeHook`.
 */
export interface AuditPoolHooks {
  'task:enqueued': (name: string, payload: unknown) => void | Promise<void>
  'task:start': (name: string, payload: unknown) => void | Promise<void>
  'task:success': (name: string, payload: unknown, result: unknown) => void | Promise<void>
  'task:error': (name: string, payload: unknown, error: Error, willRetry: boolean) => void | Promise<void>
  'queue:drained': () => void | Promise<void>
}

/** Snapshot of pool state. Returned by `getStats(pool)`. */
export interface AuditPoolStats {
  enqueued: number
  completed: number
  errored: number
  active: number
  queued: number
  workers: number
  startedAt: number
}

/**
 * Opaque driver-side handle. Use the free functions to operate on it; the internals live on
 * `_internal` to keep the public type clean.
 */
export interface AuditPool {
  readonly hooks: Hookable<AuditPoolHooks>
  readonly options: Readonly<ResolvedAuditPoolOptions>
  /** @internal */
  readonly _internal: AuditPoolInternal
}

/** @internal */
export interface AuditPoolInternal {
  pool: unknown
  stats: AuditPoolStats
  pending: Set<Promise<unknown>>
  destroyed: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Worker-side
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkerHooks {
  'browser:launched': (browser: Browser) => void | Promise<void>
  'browser:closing': (browser: Browser) => void | Promise<void>
  'context:created': (context: BrowserContext) => void | Promise<void>
  'page:created': (page: Page) => void | Promise<void>
  'page:closing': (page: Page) => void | Promise<void>
}

export interface WorkerTaskContext {
  /** Undefined when `bare: true`. */
  browser?: Browser
  /** Undefined when `bare: true`. */
  context?: BrowserContext
  /** Undefined when `bare: true`. */
  page?: Page
  /** Whatever was passed via `AuditPoolOptions.workerData`. */
  workerData: Record<string, unknown>
  threadId: number
}

export type WorkerTask<TPayload = unknown, TResult = unknown> = (
  ctx: WorkerTaskContext,
  payload: TPayload,
) => Promise<TResult> | TResult

export interface WorkerDefinition {

  tasks: Record<string, WorkerTask<any, any>>
  hooks?: Partial<WorkerHooks>
}
