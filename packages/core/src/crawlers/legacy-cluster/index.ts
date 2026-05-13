import type { Logger, ResolvedUserConfig, RuntimeSettings, UnlighthouseRouteReport, UnlighthouseTask, UnlighthouseWorker } from '@unlighthouse/contracts'
import type {
  CrawlCtx,
  Crawler,
  CrawlerRunOptions,
  CrawlerState,
  CrawlEvent,
} from '@unlighthouse/contracts/ports'
import type { Page } from '@unlighthouse/contracts/types/puppeteer'
import type { Hookable } from 'hookable'
import type { normaliseRoute } from '../../api/util'
import type { InspectHtmlTaskState } from './tasks/html'
import { createHooks } from 'hookable'
import { createInspectHtmlTask } from './tasks/html'
import { createRunLighthouseTask } from './tasks/lighthouse'
import { createUnlighthouseWorker } from './worker'

export * from './cluster'
export * from './orchestrator'
export * from './tasks'
export * from './worker'

// ────────────────────────────────────────────────────────────────────────────
// Legacy worker hook names (emitted internally by the puppeteer-cluster worker).
// These are adapter-private — not part of the global HookMap.
// ────────────────────────────────────────────────────────────────────────────
export interface LegacyWorkerHooks {
  'task-added': (path: string, report: UnlighthouseRouteReport) => void
  'task-started': (path: string, report: UnlighthouseRouteReport) => void
  'task-complete': (path: string, report: UnlighthouseRouteReport, taskName: UnlighthouseTask) => void
  'worker-finished': () => void
  'worker-cancelled': () => void
  'worker-error': (error: Error) => void
  'puppeteer:before-goto': (page: Page) => void | Promise<void>
  // Legacy hooks forwarded from config
  'resolved-config': (config: ResolvedUserConfig) => void | Promise<void>
  'visited-client': () => void | Promise<void>
  'site-changed': (site: string) => void | Promise<void>
  'authenticate': (page: Page) => void | Promise<void>
}

// ────────────────────────────────────────────────────────────────────────────
// legacyClusterEngine — D-024: wraps the puppeteer-cluster worker as the
// v1 Crawler+Auditor adapter pair.
// ────────────────────────────────────────────────────────────────────────────

export interface LegacyClusterDeps {
  resolvedConfig: ResolvedUserConfig
  runtimeSettings: RuntimeSettings
  hooks: Hookable<LegacyWorkerHooks>
  logger?: Logger
}

export interface LegacyClusterEngine {
  worker: UnlighthouseWorker
  /** The raw hookable for attaching legacy hook listeners. */
  hooks: Hookable<LegacyWorkerHooks>
  shutdown: () => Promise<void>
}

/**
 * D-024: wraps the puppeteer-cluster worker as the v1 Crawler+Auditor pair.
 * Internally constructs `launchPuppeteerCluster` + `createInspectHtmlTask` +
 * `createRunLighthouseTask`. All returned values share the same cluster.
 */
export async function legacyClusterEngine(deps: LegacyClusterDeps): Promise<LegacyClusterEngine> {
  const { resolvedConfig, runtimeSettings, hooks, logger } = deps

  const i18nState: InspectHtmlTaskState = { i18nWarnFired: false }

  const normaliseDeps = { siteUrl: runtimeSettings.siteUrl, resolvedConfig }

  // Tasks share worker via queueRoute callback — wired after worker is created
  let workerRef: UnlighthouseWorker | null = null

  const htmlTaskDeps = {
    resolvedConfig,
    runtimeSettings,
    hooks,
    logger,
    siteUrl: runtimeSettings.siteUrl,
    queueRoute: (route: ReturnType<typeof normaliseRoute>) => {
      workerRef?.queueRoute(route)
    },
  }

  const lhTaskDeps = {
    resolvedConfig,
    runtimeSettings,
    hooks,
    logger,
  }

  const tasks = {
    inspectHtmlTask: createInspectHtmlTask(htmlTaskDeps, i18nState),
    runLighthouseTask: createRunLighthouseTask(lhTaskDeps),
  }

  const workerDeps = {
    resolvedConfig,
    runtimeSettings,
    hooks,
    logger,
  }

  const worker = await createUnlighthouseWorker(workerDeps, tasks)
  workerRef = worker

  const shutdown = async () => {
    await worker.cluster.close().catch(() => {})
  }

  return { worker, hooks, shutdown }
}

// ────────────────────────────────────────────────────────────────────────────
// crawleeCrawler — v1 Crawler port facade (unchanged)
// ────────────────────────────────────────────────────────────────────────────

export interface CrawleeCrawlerOptions {
  concurrency?: number
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

/** Adapter-private events for the crawlee crawler. Not part of the global HookMap. */
export interface CrawleeAdapterHooks {
  'request:retry': (info: { url: string, attempt: number }) => void
  'queue:drained': () => void
}

export type CrawleeCrawler = Crawler & { hooks: Hookable<CrawleeAdapterHooks> }

/**
 * crawleeCrawler — facade that adapts the existing puppeteer-cluster orchestrator
 * to the Crawler port shape.
 */
export function crawleeCrawler(opts: CrawleeCrawlerOptions = {}): CrawleeCrawler {
  const concurrency = Math.max(1, opts.concurrency ?? 5)

  const hooks = createHooks<CrawleeAdapterHooks>()
  const attempts = new Map<string, number>()

  let state: CrawlerState = 'idle'
  let pauseResolve: (() => void) | null = null
  let pausePromise: Promise<void> | null = null

  function getState(): CrawlerState {
    return state
  }

  async function pause(): Promise<void> {
    if (state !== 'running')
      return
    pausePromise = new Promise<void>((r) => {
      pauseResolve = r
    })
    state = 'paused'
  }

  async function resume(): Promise<void> {
    if (state !== 'paused')
      return
    state = 'running'
    pauseResolve?.()
    pauseResolve = null
    pausePromise = null
  }

  async function* run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
    state = 'running'

    const signal = runOpts.signal
    const scanId = (globalThis as any).crypto?.randomUUID?.() ?? `scan-${Date.now()}`
    const ctx: CrawlCtx = { scanId, signal }

    const queue: CrawlEvent[] = []
    let resolveWaiter: (() => void) | null = null
    const wake = () => {
      if (resolveWaiter) {
        const r = resolveWaiter
        resolveWaiter = null
        r()
      }
    }
    const waitForEvent = () => new Promise<void>((res) => {
      resolveWaiter = res
    })
    const emit = (e: CrawlEvent) => {
      queue.push(e)
      wake()
    }

    const inflight = new Set<Promise<void>>()
    let dispatchedAll = false
    let aborted = false

    const onAbort = () => {
      aborted = true
      pauseResolve?.()
      wake()
    }
    if (signal) {
      if (signal.aborted)
        onAbort()
      else
        signal.addEventListener('abort', onAbort, { once: true })
    }

    const dispatch = (async () => {
      try {
        for await (const seed of runOpts.seeds.seeds()) {
          if (aborted)
            break

          while (true) {
            if (getState() !== 'paused' || aborted)
              break
            await (pausePromise ?? Promise.resolve())
          }
          if (aborted)
            break

          if (runOpts.allows && !runOpts.allows(seed.url))
            continue

          emit({ type: 'url-discovered', url: seed.url, from: seed.source })

          while (true) {
            if (inflight.size < concurrency || aborted)
              break
            await Promise.race(inflight)
          }
          if (aborted)
            break

          if (runOpts.crawlDelayMs && runOpts.crawlDelayMs > 0) {
            await new Promise(r => setTimeout(r, runOpts.crawlDelayMs))
          }

          const url = seed.url
          const attempt = (attempts.get(url) ?? 0) + 1
          attempts.set(url, attempt)
          if (attempt > 1)
            hooks.callHook('request:retry', { url, attempt })
          emit({ type: 'url-started', url })
          const task = runOpts.audit(url, ctx)
            .then(() => {
              emit({ type: 'url-completed', url })
            })
            .catch((err: unknown) => {
              const error = err instanceof Error ? err : new Error(String(err))
              emit({ type: 'url-failed', url, error })
            })
            .finally(() => {
              inflight.delete(task)
              wake()
            })
          inflight.add(task)
        }
      }
      finally {
        dispatchedAll = true
        wake()
      }
    })()

    try {
      while (true) {
        while (queue.length)
          yield queue.shift()!
        if (dispatchedAll && inflight.size === 0)
          break
        if (aborted && inflight.size === 0)
          break

        await waitForEvent()
      }
      while (queue.length)
        yield queue.shift()!
      hooks.callHook('queue:drained')
      yield { type: 'idle' }
    }
    finally {
      if (signal)
        signal.removeEventListener('abort', onAbort)
      await dispatch.catch(() => {})
      state = 'idle'
    }
  }

  return { run, pause, resume, state: getState, hooks }
}
