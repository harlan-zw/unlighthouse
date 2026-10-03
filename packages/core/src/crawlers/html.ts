import type { Logger } from '@unlighthouse/contracts'
import type { Crawler, CrawlerRunOptions, CrawlerState, CrawlEvent } from '@unlighthouse/contracts/ports'
import type { FetchConfig } from '../util/fetch'
import { resolveFetchHeaders } from '../util/fetch'
import { extractPageDiscovery } from '../util/html-discovery'
import { isI18nAlternatePage, normaliseUrl, sameHostCanonical } from '../util/i18n'

export interface HtmlCrawlerOptions {
  concurrency?: number
  maxRequests?: number
  logger?: Logger
  noFollow?: boolean
  fetchConfig?: FetchConfig
  site?: string
  timeoutMs?: number
  maxHtmlBytes?: number
  fetch?: typeof globalThis.fetch
}

type HtmlResult
  = | { _tag: 'Ok', url: string, html: string }
    | { _tag: 'Err', error: Error }

const asError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error))

/** Native fetch and bounded work, adapted from NuxtSEO's fetch-html provider. */
export function htmlCrawler(opts: HtmlCrawlerOptions = {}): Crawler {
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 5))
  const fetch = opts.fetch ?? globalThis.fetch
  const headers = resolveFetchHeaders(opts.fetchConfig ?? {})
  let state: CrawlerState = 'idle'

  async function fetchHtml(input: string, signal: AbortSignal, allows?: (url: string) => boolean): Promise<HtmlResult> {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(opts.timeoutMs ?? 30_000)])
    const credentialOrigin = new URL(opts.site ?? input).origin
    try {
      let url = new URL(input)
      for (const [key, value] of Object.entries(opts.fetchConfig?.defaultQueryParams || {}))
        url.searchParams.set(key, String(value))
      for (let redirects = 0; redirects <= 5; redirects++) {
        if (!['http:', 'https:'].includes(url.protocol) || (allows && !allows(url.toString())))
          throw new Error(`Redirect target is excluded: ${url}`)
        // Every redirect rechecks the origin before sending configured credentials.
        const requestHeaders = url.origin === credentialOrigin ? headers : { 'user-agent': headers['user-agent']! }
        let response: Response
        try {
          response = await fetch(url, { headers: requestHeaders, redirect: 'manual', signal: requestSignal })
        }
        catch (error) {
          if (requestSignal.aborted)
            throw error
          opts.logger?.debug?.(`Retrying HTML request: ${url}`, error)
          response = await fetch(url, { headers: requestHeaders, redirect: 'manual', signal: requestSignal })
        }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel()
          const location = response.headers.get('location')
          if (!location)
            throw new Error(`Redirect has no location: ${url}`)
          url = new URL(location, url)
          continue
        }
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
        if (!response.ok || !/text\/html|application\/xhtml\+xml/.test(contentType)) {
          await response.body?.cancel()
          throw new Error(`HTML request failed: ${response.status} ${url}`)
        }
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        const maxBytes = opts.maxHtmlBytes ?? 8 * 1024 * 1024
        let bytes = 0
        let html = ''
        if (reader) {
          try {
            while (true) {
              const chunk = await reader.read()
              if (chunk.done)
                break
              bytes += chunk.value.byteLength
              if (bytes > maxBytes) {
                await reader.cancel()
                throw new Error(`HTML exceeds ${maxBytes} bytes: ${url}`)
              }
              html += decoder.decode(chunk.value, { stream: true })
            }
            html += decoder.decode()
          }
          finally {
            reader.releaseLock()
          }
        }
        return { _tag: 'Ok', url: url.toString(), html }
      }
      throw new Error(`Too many redirects: ${input}`)
    }
    catch (error) {
      return { _tag: 'Err', error: asError(error) }
    }
  }

  async function* run(runOpts: CrawlerRunOptions): AsyncIterable<CrawlEvent> {
    state = 'running'
    const controller = new AbortController()
    const signal = runOpts.signal ? AbortSignal.any([controller.signal, runOpts.signal]) : controller.signal
    const ctx = { scanId: globalThis.crypto.randomUUID(), signal }
    const limit = Math.max(0, Math.min(opts.maxRequests ?? 1000, runOpts.maxRoutes ?? 1000))
    const events: CrawlEvent[] = []
    const pending: string[] = []
    const discovered = new Set<string>()
    const audited = new Set<string>()
    const tasks = new Set<Promise<void>>()
    const waiters = new Set<() => void>()
    let host: string | undefined
    let seedsDone = false
    let seedFailure: { error: unknown } | undefined
    const checkSeedFailure = () => {
      if (seedFailure)
        throw seedFailure.error
    }
    const wake = () => {
      for (const resolve of waiters)
        resolve()
      waiters.clear()
    }
    const emit = (event: CrawlEvent) => {
      events.push(event)
      wake()
    }
    const enqueue = (raw: string, from?: string, seed = false) => {
      if (signal.aborted || discovered.size >= limit || (runOpts.allows && !runOpts.allows(raw)))
        return
      // Invalid seeds remain fatal configuration errors, rather than empty scans.
      const key = normaliseUrl(raw) ?? raw
      if (discovered.has(key))
        return
      if (seed)
        emit({ type: 'url-discovered', url: raw, from })
      const parsed = new URL(raw)
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error(`Unsupported seed protocol: ${parsed.protocol}`)
      if (!seed && host && parsed.host !== host)
        return
      host ??= parsed.host
      discovered.add(key)
      pending.push(key)
      if (!seed)
        emit({ type: 'url-discovered', url: key, from })
      wake()
    }
    const visit = async (input: string) => {
      const result = await fetchHtml(input, signal, runOpts.allows)
      if (signal.aborted)
        return
      if (result._tag === 'Err') {
        emit({ type: 'url-failed', url: input, error: result.error })
        return
      }
      const url = result.url
      const discovery = extractPageDiscovery({ html: result.html, pageUrl: url, siteUrl: url })
      if (!(runOpts.noFollow ?? opts.noFollow)) {
        for (const link of discovery.links)
          enqueue(link, url)
        for (const href of [discovery.canonical, discovery.xDefault]) {
          const target = sameHostCanonical(url, href)
          if (target)
            enqueue(target, url)
        }
      }
      const key = normaliseUrl(url) ?? url
      const duplicate = runOpts.ignoreI18nPages && isI18nAlternatePage(url, discovery.xDefault)
      if (!audited.has(key) && !duplicate) {
        audited.add(key)
        emit({ type: 'url-started', url })
        try {
          await runOpts.audit(url, ctx)
          if (!signal.aborted)
            emit({ type: 'url-completed', url })
        }
        catch (error) {
          if (!signal.aborted)
            emit({ type: 'url-failed', url, error: asError(error) })
        }
      }
      if (runOpts.crawlDelayMs && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer)
            signal.removeEventListener('abort', finish)
            resolve()
          }
          const timer = setTimeout(finish, runOpts.crawlDelayMs)
          signal.addEventListener('abort', finish, { once: true })
        })
      }
    }
    signal.addEventListener('abort', wake)
    // Seed discovery proceeds independently, so slow sitemaps cannot block ready URLs.
    const producer = (async () => {
      const iterator = runOpts.seeds.seeds()[Symbol.asyncIterator]()
      try {
        while (!signal.aborted && discovered.size < limit) {
          const next = await iterator.next()
          if (next.done)
            break
          enqueue(next.value.url, next.value.source, true)
        }
      }
      finally {
        // A seed provider may still await network I/O when a scan is cancelled.
        void iterator.return?.().catch((error: unknown) => {
          opts.logger?.warn?.('Seed source cleanup failed', error)
        })
      }
    })().catch((error: unknown) => {
      seedFailure = { error }
    }).finally(() => {
      seedsDone = true
      wake()
    })
    void producer
    try {
      while (!signal.aborted) {
        checkSeedFailure()
        while (pending.length && tasks.size < concurrency) {
          const input = pending.shift()!
          const task = visit(input).catch((error: unknown) => {
            emit({ type: 'url-failed', url: input, error: asError(error) })
          }).finally(() => {
            tasks.delete(task)
            wake()
          })
          tasks.add(task)
        }
        while (events.length)
          yield events.shift()!
        checkSeedFailure()
        if (seedsDone && !pending.length && !tasks.size)
          break
        if (events.length || (pending.length && tasks.size < concurrency))
          continue
        await new Promise<void>(resolve => waiters.add(resolve))
      }
      while (events.length)
        yield events.shift()!
      yield { type: 'idle' }
    }
    finally {
      controller.abort()
      signal.removeEventListener('abort', wake)
      await Promise.all(tasks)
      state = 'idle'
    }
  }

  return { run, state: () => state }
}
