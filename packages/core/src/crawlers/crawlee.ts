import type { Logger } from '@unlighthouse/contracts'
import type {
  CrawlCtx,
  Crawler,
  CrawlerRunOptions,
  CrawlerState,
  CrawlEvent,
} from '@unlighthouse/contracts/ports'
import type { RequestTransform } from 'crawlee'
import type { Hookable } from 'hookable'
import { CheerioCrawler, log as crawleeLog, RequestQueue } from 'crawlee'
import { createHooks } from 'hookable'
import { isI18nAlternatePage, normaliseUrl, sameHostCanonical } from '../util/i18n'

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
    const scanId = globalThis.crypto.randomUUID()
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

    // Dedup on a normalised key (absolute, no trailing slash, no hash) rather
    // than the raw href. Without this, `/blog`, `/blog/`, `/blog#x` and the
    // same link repeated across every page's nav each count as a fresh
    // "discovered" URL — which inflated the discovered/total stat to many times
    // the real page count (e.g. 449 for a 22-page site) and re-queued the same
    // page repeatedly. Falls back to the raw URL if it can't be parsed.
    const dedupKey = (url: string): string => normaliseUrl(url) ?? url
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
      if (discovered.has(dedupKey(seed.url)))
        continue
      discovered.add(dedupKey(seed.url))
      initialUrls.push(seed.url)
      emit({ type: 'url-discovered', url: seed.url, from: seed.source })
      try {
        originHost ??= new URL(seed.url).host
      }
      catch (_err) {
        // ignore malformed seed
      }
    }

    if (initialUrls.length === 0) {
      yield { type: 'idle' }
      state = 'idle'
      return
    }

    // Isolate each run in its own request queue. crawlee's default queue is
    // a per-process singleton, so without this a URL handled by one scan is
    // seen as already-handled by the next scan of the same URL — it gets
    // skipped and the scan returns empty. A unique named queue per run (dropped
    // in finally) keeps re-scans and concurrent scans independent.
    const requestQueue = await RequestQueue.open(`unlighthouse-${scanId}`)

    const crawler = new CheerioCrawler({
      requestQueue,
      maxConcurrency: concurrency,
      maxRequestsPerCrawl: maxRequests,
      respectRobotsTxtFile: false,
      requestHandler: async ({ request, enqueueLinks, $ }) => {
        if (aborted)
          return
        const url = request.loadedUrl || request.url
        const attempt = (attempts.get(url) ?? 0) + 1
        attempts.set(url, attempt)
        if (attempt > 1)
          await hooks.callHook('request:retry', { url, attempt })

        // Shared dedup + allow-filter + discovery-emit used by link, canonical
        // and x-default enqueue alike.
        const transformRequestFunction: RequestTransform = (req) => {
          // Only same-host http(s) pages count as discovered routes. The crawler
          // surfaces every link it sees here — including outbound links
          // (github.com, twitter.com, youtube.com…) and non-http schemes
          // (mailto:, tel:) — none of which are ever audited (enqueue uses
          // `same-hostname`). Counting them inflated `discovered`/`total` to many
          // times the real page count (449 / 222 for a ~22-page site).
          let reqHost: string | undefined
          try {
            const parsed = new URL(req.url)
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
              return false
            reqHost = parsed.host
          }
          catch (_err) {
            return false
          }
          if (originHost && reqHost !== originHost)
            return false
          const key = dedupKey(req.url)
          if (discovered.has(key))
            return false
          if (runOpts.allows && !runOpts.allows(req.url))
            return false
          discovered.add(key)
          emit({ type: 'url-discovered', url: req.url, from: url })
          return req
        }

        // A page that declares an `x-default` alternate pointing at a *different*
        // URL is a localized duplicate. With `ignoreI18nPages` we skip its audit
        // (the x-default page carries the canonical scan) but still enqueue the
        // x-default target below so it does get scanned.
        const xDefaultHref = $ ? $('link[rel="alternate"][hreflang="x-default"]').attr('href') : undefined
        const isI18nDuplicate = (runOpts.ignoreI18nPages ?? false) && isI18nAlternatePage(url, xDefaultHref)

        const auditKey = dedupKey(url)
        if (!audited.has(auditKey) && !isI18nDuplicate) {
          audited.add(auditKey)
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

        // Per-scan noFollow (page mode) wins over the adapter-construction
        // default, so the dashboard's per-scan mode can disable crawling.
        if (runOpts.noFollow ?? opts.noFollow)
          return

        await enqueueLinks({
          strategy: 'same-hostname',
          transformRequestFunction,
        })

        // Also follow same-host canonical + x-default targets — these aren't
        // always reachable through the page's `<a>` links.
        if ($) {
          const extra = new Set<string>()
          const canonical = sameHostCanonical(url, $('link[rel="canonical"]').attr('href'))
          if (canonical)
            extra.add(canonical)
          const xDefault = sameHostCanonical(url, xDefaultHref)
          if (xDefault)
            extra.add(xDefault)
          if (extra.size) {
            await enqueueLinks({
              urls: [...extra],
              transformRequestFunction,
            })
          }
        }

        if (runOpts.crawlDelayMs && runOpts.crawlDelayMs > 0)
          await new Promise(r => setTimeout(r, runOpts.crawlDelayMs))
      },
      failedRequestHandler: ({ request, error }) => {
        const url = request.loadedUrl || request.url
        const err = error instanceof Error ? error : new Error(String(error))
        opts.logger?.debug?.(`crawlee failed: ${url}`, err)
        const failKey = dedupKey(url)
        if (!audited.has(failKey)) {
          audited.add(failKey)
          emit({ type: 'url-failed', url, error: err })
        }
      },
    })

    let runError: unknown
    const runPromise = crawler.run(initialUrls)
      .catch((err: unknown) => {
        runError = err
        opts.logger?.warn?.('crawlee run failed', err)
      })
      .finally(() => {
        wake()
      })

    let done = false
    try {
      while (!done) {
        while (queue.length) {
          const event = queue.shift()
          if (event)
            yield event
        }

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
      while (queue.length) {
        const event = queue.shift()
        if (event)
          yield event
      }

      if (runError && !aborted)
        throw runError

      await hooks.callHook('queue:drained')
      yield { type: 'idle' }
    }
    finally {
      if (signal)
        signal.removeEventListener('abort', onAbort)
      state = 'idle'
      // Drop the per-run queue so it doesn't accumulate on disk or leak into
      // the next run's dedup set.
      await requestQueue.drop().catch((err) => {
        opts.logger?.warn?.(`failed to drop crawlee request queue for scan ${scanId}`, err)
      })
      // Prevent unused-var warning
      void originHost
    }
  }

  return { run, state: getState, hooks }
}
