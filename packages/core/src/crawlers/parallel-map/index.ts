import type { Logger } from '@unlighthouse/contracts'
import type {
  CrawlCtx,
  Crawler,
  CrawlerRunOptions,
  CrawlerState,
  CrawlEvent,
} from '@unlighthouse/contracts/ports'

export interface ParallelMapCrawlerOptions {
  concurrency?: number
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

interface PausePromise {
  promise: Promise<void>
  resolve: () => void
}

function createPauseGate(): PausePromise {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/**
 * parallelMapCrawler — worker-safe Crawler for finite seed lists.
 *
 * No discovery: iterates `seeds`, applies `allows`, dispatches `audit` with a
 * configurable concurrency. Emits {url-discovered, url-completed, url-failed, idle}.
 * Supports pause/resume by gating dispatch on a pause promise; supports abort
 * via signal (caller-supplied + internal merge).
 */
export function parallelMapCrawler(opts: ParallelMapCrawlerOptions = {}): Crawler {
  const concurrency = Math.max(1, opts.concurrency ?? 5)

  let state: CrawlerState = 'idle'
  let gate: PausePromise | null = null

  function getState(): CrawlerState {
    return state
  }

  async function pause(): Promise<void> {
    if (state !== 'running')
      return
    if (!gate)
      gate = createPauseGate()
    state = 'paused'
  }

  async function resume(): Promise<void> {
    if (state !== 'paused')
      return
    state = 'running'
    if (gate) {
      gate.resolve()
      gate = null
    }
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
      // unblock pause if any
      if (gate) {
        gate.resolve()
        gate = null
      }
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

          // pause gate
          while (true) {
            if (getState() !== 'paused' || aborted)
              break
            await (gate?.promise ?? Promise.resolve())
          }
          if (aborted)
            break

          if (runOpts.allows && !runOpts.allows(seed.url))
            continue

          emit({ type: 'url-discovered', url: seed.url, from: seed.source })

          // concurrency gate
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

      // drain any remaining queued events
      while (queue.length)
        yield queue.shift()!

      yield { type: 'idle' }
    }
    finally {
      if (signal)
        signal.removeEventListener('abort', onAbort)
      await dispatch.catch(() => {})
      state = 'idle'
    }
  }

  return {
    run,
    pause,
    resume,
    state: getState,
  }
}
