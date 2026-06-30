// Workers-native sitemap discovery.
//
// This adapter reproduces the core "discover the whole site from its sitemap"
// behaviour using only the global `fetch` and a regex XML scan — no Node deps —
// so a Cloudflare scan crawls every URL in the sitemap instead of just the seed.

import type { Logger } from '@unlighthouse/contracts'
import type { SeedSource } from '@unlighthouse/contracts/ports'
import type { Seed } from '@unlighthouse/contracts/types/atoms'

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
}

const LOC_RE = /<loc>([^<]*)<\/loc>/gi

function extractLocs(xml: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  // eslint-disable-next-line no-cond-assign
  while ((m = LOC_RE.exec(xml)) !== null) {
    // Sitemap <loc> values are XML-escaped; decode the common entities.
    const raw = (m[1] ?? '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, '\'')
      .trim()
    if (raw)
      out.push(raw)
  }
  return out
}

function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml)
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/xml,text/xml,text/plain,*/*' },
      redirect: 'follow',
    })
    if (!res.ok)
      return null
    return await res.text()
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
  const maxDepth = Math.max(1, opts.maxDepth ?? 3)
  const timeoutMs = Math.max(1000, opts.timeoutMs ?? 15000)
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

      const initial = opts.sitemaps && opts.sitemaps !== true && opts.sitemaps.length > 0
        ? opts.sitemaps.map(s => (s.startsWith('http') ? s : new URL(s, origin).toString()))
        : [`${origin}/sitemap.xml`]

      const seenSitemaps = new Set<string>()
      const emitted = new Set<string>()
      // BFS over sitemap (index) files, depth-limited.
      let frontier: string[] = initial
      let depth = 0
      let count = 0

      while (frontier.length > 0 && depth < maxDepth && count < limit) {
        const next: string[] = []
        for (const sm of frontier) {
          if (seenSitemaps.has(sm))
            continue
          seenSitemaps.add(sm)

          const xml = await fetchText(sm, timeoutMs)
          if (xml == null) {
            debug('[worker-sitemap] fetch failed', sm)
            continue
          }
          const locs = extractLocs(xml)
          debug(`[worker-sitemap] ${sm} → ${locs.length} <loc> entries`)

          if (isSitemapIndex(xml)) {
            // Child sitemaps — keep same-origin only to stay on-site.
            for (const loc of locs) {
              try {
                if (new URL(loc).origin === origin)
                  next.push(loc)
              }
              catch (err) {
                debug('[worker-sitemap] malformed child sitemap URL, skipping', loc, err)
              }
            }
            continue
          }

          for (const loc of locs) {
            if (count >= limit)
              break
            let url: string
            try {
              url = new URL(loc, origin).toString()
              if (new URL(url).origin !== origin)
                continue
            }
            catch (_err) {
              continue
            }
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
