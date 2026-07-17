// Workers-native sitemap discovery.
//
// This adapter combines the shared, runtime-portable sitemap parser with the
// global `fetch`, so a Cloudflare scan discovers every sitemap URL without
// pulling Node-specific fetch behavior into the Worker.

import type { Logger } from '@unlighthouse/contracts'
import type { SeedSource } from '@unlighthouse/contracts/ports'
import type { Seed } from '@unlighthouse/contracts/types/atoms'
import { extractSitemapMetaRefreshUrl, parseSitemapDocument, resolveSitemapLocation } from '@unlighthouse/core/seeds/sitemap-parser'

export interface WorkerSitemapSeedsOptions {
  /**
   * Lazily resolves the site to discover from. Read at `seeds()` time so a
   * single Worker instance can serve scans for any host (the inbound
   * `scan.start` body sets it just before the crawl). Return the origin or a
   * full URL; only its origin is used to build the sitemap URL.
   */
  site: () => string | null | undefined
  /**
   * Sitemap URLs to fetch. Omit (or pass `true`) to default to
   * `${origin}/sitemap.xml`. Mirrors `scanner.sitemap` config.
   */
  sitemaps?: true | string[]
  /** Tagged logger; absent = silent. */
  logger?: Logger
  /** Safety cap on the number of URLs yielded. Default 5000. */
  limit?: number
  /** Max sitemap-index recursion depth. Default 3. */
  maxDepth?: number
  /** Per-fetch timeout in ms. Default 15000. */
  timeoutMs?: number
  /** Maximum decompressed sitemap body size in bytes. Default 2 MiB. */
  maxBytes?: number
}

interface FetchedSitemapText {
  contentType: string | null
  text: string
  url: string
}

async function fetchText(url: string, origin: string, timeoutMs: number, maxBytes: number): Promise<FetchedSitemapText | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let current = url
    let res: Response | null = null
    for (let redirects = 0; redirects <= 3; redirects++) {
      res = await fetch(current, {
        signal: controller.signal,
        headers: { accept: 'application/xml,text/xml,text/plain,*/*' },
        redirect: 'manual',
      })
      if (res.status < 300 || res.status >= 400)
        break
      const location = res.headers.get('location')
      if (!location)
        return null
      const next = new URL(location, current)
      if (next.origin !== origin)
        return null
      current = next.toString()
      res = null
    }
    if (!res)
      return null
    if (!res.ok)
      return null
    const contentLength = Number(res.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await res.body?.cancel()
      return null
    }
    if (!res.body)
      return { contentType: res.headers.get('content-type'), text: '', url: current }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let bytes = 0
    let text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    return {
      contentType: res.headers.get('content-type'),
      text: text + decoder.decode(),
      url: current,
    }
  }
  catch (_err) {
    return null
  }
  finally {
    clearTimeout(t)
  }
}

export function workerSitemapSeeds(opts: WorkerSitemapSeedsOptions): SeedSource {
  const limit = Math.max(1, opts.limit ?? 5000)
  const maxDepth = Math.max(0, opts.maxDepth ?? 3)
  const timeoutMs = Math.max(1000, opts.timeoutMs ?? 15000)
  const maxBytes = Math.max(1024, opts.maxBytes ?? 2 * 1024 * 1024)
  const debug = (...a: unknown[]) => opts.logger?.debug?.(...a)

  return {
    async* seeds(): AsyncIterable<Seed> {
      const site = opts.site()
      if (!site)
        return

      let origin: string
      try {
        origin = new URL(site).origin
      }
      catch (_err) {
        debug('[worker-sitemap] invalid site, skipping discovery', site)
        return
      }

      const configured = opts.sitemaps && opts.sitemaps !== true && opts.sitemaps.length > 0
        ? opts.sitemaps
        : ['/sitemap.xml']
      const initial: string[] = []
      for (const value of configured) {
        const url = resolveSitemapLocation(value, origin)
        if (!url || new URL(url).origin !== origin) {
          debug('[worker-sitemap] invalid or off-origin sitemap URL, skipping', value)
          continue
        }
        initial.push(url)
      }

      const seenSitemaps = new Set<string>()
      const emitted = new Set<string>()
      // BFS over sitemap (index) files, depth-limited.
      let frontier: string[] = initial
      let depth = 0
      let count = 0

      while (frontier.length > 0 && depth <= maxDepth && count < limit) {
        const next: string[] = []
        for (const sm of frontier) {
          if (seenSitemaps.has(sm))
            continue
          seenSitemaps.add(sm)

          const fetched = await fetchText(sm, origin, timeoutMs, maxBytes)
          if (fetched == null) {
            debug('[worker-sitemap] fetch failed', sm)
            continue
          }
          const document = parseSitemapDocument(fetched.text, {
            contentType: fetched.contentType,
            url: fetched.url,
          })
          debug(`[worker-sitemap] ${sm} → ${document.locations.length} sitemap entries`)

          if (document.kind === 'unknown') {
            const redirect = extractSitemapMetaRefreshUrl(fetched.text, fetched.url)
            if (redirect && new URL(redirect).origin === origin)
              next.push(redirect)
            continue
          }

          if (document.kind === 'index') {
            // Child sitemaps — keep same-origin only to stay on-site.
            for (const loc of document.locations) {
              const child = resolveSitemapLocation(loc, fetched.url)
              if (child && new URL(child).origin === origin)
                next.push(child)
              else
                debug('[worker-sitemap] malformed or off-origin child sitemap URL, skipping', loc)
            }
            continue
          }

          for (const loc of document.locations) {
            if (count >= limit)
              break
            const url = resolveSitemapLocation(loc, fetched.url)
            if (!url || new URL(url).origin !== origin)
              continue
            if (emitted.has(url))
              continue
            emitted.add(url)
            count++
            yield { url, source: 'sitemap' }
          }
        }
        frontier = next
        depth++
      }

      if (count >= limit)
        opts.logger?.warn?.(`[worker-sitemap] hit ${limit}-URL cap; some sitemap URLs were dropped`)
    },
  }
}
