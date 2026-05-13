import type { Logger } from '@unlighthouse/contracts'
import type {
  CrawlCtx,
  Crawler,
  CrawlerRunOptions,
  CrawlerState,
  CrawlEvent,
} from '@unlighthouse/contracts/ports'
import type { Hookable } from 'hookable'
import { createHooks } from 'hookable'

export * from './cluster'
export * from './orchestrator'
export * from './tasks'
export * from './worker'

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
 *
 * run() iterates seeds and delegates per-URL audit to opts.audit, mirroring
 * the parallel-map shape. The legacy crawlee discovery path remains available via
 * the named exports above for use inside the orchestrator.
 */
export function crawleeCrawler(opts: CrawleeCrawlerOptions = {}): CrawleeCrawler {
  const concurrency = Math.max(1, opts.concurrency ?? 5)

  const hooks = createHooks<CrawleeAdapterHooks>()
  // Tracks per-URL audit attempts so `request:retry` reports an accurate count.
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
          // Repeated dispatch of the same URL = a retry; surface it to consumers.
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
      // Dispatch finished and inflight is empty: the request queue has drained.
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
