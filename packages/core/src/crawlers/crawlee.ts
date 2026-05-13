import type { Logger } from '@unlighthouse/contracts'
import type {
  CrawlCtx,
  Crawler,
  CrawlerRunOptions,
  CrawlerState,
  CrawlEvent,
} from '@unlighthouse/contracts/ports'
import type { Hookable } from 'hookable'
import { CheerioCrawler, log as crawleeLog } from 'crawlee'
import { createHooks } from 'hookable'

export interface CrawleeCrawlerOptions {
  concurrency?: number
  /** Cap on URLs discovered+enqueued. Default: 1000. */
  maxRequests?: number
  /** Logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
  /** Disable link-following — only audits the input seeds. Default: false. */
  noFollow?: boolean
}

/** Adapter-private events. Not part of the global HookMap. */
export interface CrawleeAdapterHooks {
  'request:retry': (info: { url: string, attempt: number }) => void
  'queue:drained': () => void
}

export type CrawleeCrawler = Crawler & { hooks: Hookable<CrawleeAdapterHooks> }

/**
 * URL-discovery + audit-orchestration Crawler. Uses crawlee's `CheerioCrawler` to walk the
 * site graph from the input seeds: each visited URL is HTML-fetched, internal links are
 * extracted and enqueued, and `audit(url, ctx)` is invoked per URL.
 *
 * No browser launch — link extraction is server-side HTML parsing. SPAs with client-rendered
 * links will only discover what's in the initial HTML; pair with a sitemap seed source to
 * fill those gaps.
 */
export function crawleeCrawler(opts: CrawleeCrawlerOptions = {}): CrawleeCrawler {
  const concurrency = Math.max(1, opts.concurrency ?? 5)
  const maxRequests = opts.maxRequests ?? 1000

  const hooks = createHooks<CrawleeAdapterHooks>()
  const attempts = new Map<string, number>()

  let state: CrawlerState = 'idle'

  function getState(): CrawlerState {
    return state
  }

  // crawlee logs noisily by default; route through provided logger or silence
  crawleeLog.setLevel(crawleeLog.LEVELS.OFF)

  async function* run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
    state = 'running'

    const signal = runOpts.signal
    const scanId = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ?? `scan-${Date.now()}`
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

    const discovered = new Set<string>()
    const audited = new Set<string>()
    let aborted = false
    let originHost: string | undefined

    const onAbort = () => {
      aborted = true
      wake()
    }
    if (signal) {
      if (signal.aborted)
        onAbort()
      else
        signal.addEventListener('abort', onAbort, { once: true })
    }

    const initialUrls: string[] = []
    for await (const seed of runOpts.seeds.seeds()) {
      if (aborted)
        break
      if (runOpts.allows && !runOpts.allows(seed.url))
        continue
      if (discovered.has(seed.url))
        continue
      discovered.add(seed.url)
      initialUrls.push(seed.url)
      emit({ type: 'url-discovered', url: seed.url, from: seed.source })
      try {
        originHost ??= new URL(seed.url).host
      }
      catch {
        // ignore malformed seed
      }
    }

    if (initialUrls.length === 0) {
      yield { type: 'idle' }
      state = 'idle'
      return
    }

    const crawler = new CheerioCrawler({
      maxConcurrency: concurrency,
      maxRequestsPerCrawl: maxRequests,
      respectRobotsTxtFile: false,
      requestHandler: async ({ request, enqueueLinks }) => {
        if (aborted)
          return
        const url = request.loadedUrl || request.url
        const attempt = (attempts.get(url) ?? 0) + 1
        attempts.set(url, attempt)
        if (attempt > 1)
          await hooks.callHook('request:retry', { url, attempt })

        if (!audited.has(url)) {
          audited.add(url)
          emit({ type: 'url-started', url })
          try {
            await runOpts.audit(url, ctx)
            emit({ type: 'url-completed', url })
          }
          catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            emit({ type: 'url-failed', url, error })
          }
        }

        if (opts.noFollow)
          return

        await enqueueLinks({
          strategy: 'same-hostname',
          transformRequestFunction: (req) => {
            if (discovered.has(req.url))
              return false
            if (runOpts.allows && !runOpts.allows(req.url))
              return false
            discovered.add(req.url)
            emit({ type: 'url-discovered', url: req.url, from: url })
            return req
          },
        })

        if (runOpts.crawlDelayMs && runOpts.crawlDelayMs > 0)
          await new Promise(r => setTimeout(r, runOpts.crawlDelayMs))
      },
      failedRequestHandler: ({ request, error }) => {
        const url = request.loadedUrl || request.url
        const err = error instanceof Error ? error : new Error(String(error))
        opts.logger?.debug?.(`crawlee failed: ${url}`, err)
        if (!audited.has(url)) {
          audited.add(url)
          emit({ type: 'url-failed', url, error: err })
        }
      },
    })

    const runPromise = crawler.run(initialUrls)
      .catch((err: unknown) => {
        opts.logger?.warn?.('crawlee run failed', err)
      })
      .finally(() => {
        wake()
      })

    let done = false
    try {
      while (!done) {
        while (queue.length)
          yield queue.shift()!

        if (aborted) {
          // crawlee doesn't expose a cancel for in-flight requests; let them settle.
          await runPromise
          done = true
          break
        }

        // Race: either runPromise resolves (crawl done) or new events appear.
        const eventOrDone = Promise.race([
          waitForEvent(),
          runPromise.then(() => 'done' as const),
        ])
        const tag = await eventOrDone
        if (tag === 'done' && queue.length === 0)
          done = true
      }
      while (queue.length)
        yield queue.shift()!

      await hooks.callHook('queue:drained')
      yield { type: 'idle' }
    }
    finally {
      if (signal)
        signal.removeEventListener('abort', onAbort)
      state = 'idle'
      // Prevent unused-var warning
      void originHost
    }
  }

  return { run, state: getState, hooks }
}
