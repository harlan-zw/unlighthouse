// Crawler port adapter backed by Cloudflare's Browser Rendering binding.
// Parallel via a small worker pool; pause/resume genuinely cannot be implemented.

import type { BrowserWorker } from '@cloudflare/puppeteer'
import type { Crawler, CrawlerRunOptions, CrawlEvent } from '@unlighthouse/contracts'
import puppeteer from '@cloudflare/puppeteer'
import { UnlighthouseError } from '@unlighthouse/contracts'

export interface CloudflareCrawlerOptions {
  /** Browser Rendering binding (env.BROWSER). */
  browser: BrowserWorker
  /** Optional concurrency hint; defaults to 4. */
  concurrency?: number
}

// Async queue used to bridge worker-pool events into the generator.
function createEventQueue<T>() {
  const buffer: T[] = []
  let resolve: ((v: IteratorResult<T>) => void) | null = null
  let done = false

  function push(v: T) {
    if (resolve) {
      const r = resolve
      resolve = null
      r({ value: v, done: false })
    }
    else {
      buffer.push(v)
    }
  }

  function close() {
    done = true
    if (resolve) {
      const r = resolve
      resolve = null
      r({ value: undefined as unknown as T, done: true })
    }
  }

  const iter: AsyncIterableIterator<T> = {
    next() {
      if (buffer.length)
        return Promise.resolve({ value: buffer.shift()!, done: false })
      if (done)
        return Promise.resolve({ value: undefined as unknown as T, done: true })
      return new Promise<IteratorResult<T>>((r) => {
        resolve = r
      })
    },
    [Symbol.asyncIterator]() { return this },
  }

  return { push, close, iter }
}

export function cloudflareCrawler(opts: CloudflareCrawlerOptions): Crawler {
  const browserBinding = opts.browser
  const concurrency = Math.max(1, opts.concurrency ?? 4)

  async function* run(options: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
    const { seeds, audit, allows, signal } = options
    // Crawler ctx is observational — core's auditWrapper closes over the
    // real scanId in its own scope (see core.ts orchestrate). The string
    // we pass here is only used for adapter-private debug logging, never
    // for storage writes. Leave it as a stable adapter tag.
    const ctxTag = 'cloudflare-crawl'

    const browser = await puppeteer.launch(browserBinding)
    const events = createEventQueue<CrawlEvent>()
    const inFlight = new Set<Promise<unknown>>()

    // Audit wrapper: emits started/completed/failed around the work.
    async function auditOne(url: string) {
      events.push({ type: 'url-started', url })
      try {
        await audit(url, { scanId: ctxTag, signal })
        events.push({ type: 'url-completed', url })
      }
      catch (err) {
        events.push({ type: 'url-failed', url, error: err instanceof Error ? err : new Error(String(err)) })
      }
    }

    // Producer: drains seeds into the pool, then signals idle/close.
    const producer = (async () => {
      try {
        for await (const seed of seeds.seeds()) {
          if (signal?.aborted)
            break
          const url = seed.url
          if (allows && !allows(url))
            continue

          events.push({ type: 'url-discovered', url })
          const p: Promise<unknown> = auditOne(url).finally(() => inFlight.delete(p))
          inFlight.add(p)
          if (inFlight.size >= concurrency)
            await Promise.race(inFlight)
        }
        await Promise.allSettled(inFlight)
        events.push({ type: 'idle' })
      }
      finally {
        events.close()
      }
    })()

    try {
      for await (const ev of events.iter)
        yield ev
      await producer
    }
    finally {
      await browser.close().catch(() => undefined)
    }
  }

  return {
    run,
    pause: async () => {
      throw new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'cloudflare-crawl cannot pause' })
    },
    resume: async () => {
      throw new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'cloudflare-crawl cannot resume' })
    },
    state: () => 'idle',
  }
}
