import type { Logger } from '@unlighthouse/contracts'
import type { SeedSource } from '@unlighthouse/contracts/ports'
import type { FetchConfig, FetchUrlClient, FetchUrlResponse } from '../util/fetch'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseRobotsTxt } from '../policies/robots/parser'
import { createFetchClient, fetchUrlRaw } from '../util/fetch'
import { isScanOrigin } from '../util/scan-origin'
import { extractSitemapMetaRefreshUrl, parseSitemapDocument, resolveSitemapLocation } from './sitemap-parser'

export interface ExtractSitemapDeps {
  resolvedConfig: FetchConfig
  siteUrl: URL
  logger?: Logger
  fetchTimeoutMs?: number
  fetchMaxRetries?: number
  onResponse?: (response: FetchUrlResponse) => void
}

interface FetchedSitemapText {
  contentType: string | null
  text: string
  url: string
}

function createSitemapClient(config: FetchConfig, origin: string): FetchUrlClient {
  const client = createFetchClient(config)
  return {
    async get(url, options) {
      for (let redirects = 0; ; redirects++) {
        const response = await client.get(url, { ...options, redirect: 'manual' })
        if (redirects === 5 || ![301, 302, 303, 307, 308].includes(response.status))
          return response
        const location = response.headers.get('location')
        const target = location && resolveSitemapLocation(location, response.url || url)
        if (!target || new URL(target).origin !== origin)
          return response
        url = target
      }
    },
  }
}

async function fetchSitemapText(deps: ExtractSitemapDeps, client: FetchUrlClient, sitemapUrl: string): Promise<FetchedSitemapText | null> {
  const fetched = await fetchUrlRaw(
    sitemapUrl,
    deps.resolvedConfig,
    {
      client,
      logger: deps.logger,
      timeoutMs: deps.fetchTimeoutMs,
      maxRetries: deps.fetchMaxRetries,
    },
  )
  if (fetched.response)
    deps.onResponse?.(fetched.response)
  if (!fetched.valid || !fetched.response)
    return null
  return {
    contentType: fetched.response.headers.get('content-type'),
    text: fetched.response.data,
    url: fetched.response.url || sitemapUrl,
  }
}

/**
 * Fetches routes from a sitemap file.
 */
export async function extractSitemapRoutes(deps: ExtractSitemapDeps, site: string, sitemaps: true | (string[])) {
  // make sure we're working from the host name
  site = new URL(site).origin
  const logger = deps.logger
  const client = createSitemapClient(deps.resolvedConfig, deps.siteUrl.origin)
  if (sitemaps === true || sitemaps.length === 0)
    sitemaps = [`${site}/sitemap.xml`]
  const seenSitemaps = new Set<string>()
  const seenPages = new Set<string>()
  const fetchedSitemaps: string[] = []
  const paths: string[] = []
  let ignored = 0

  const isExpectedOrigin = (url: string) => new URL(url).origin === deps.siteUrl.origin

  async function visit(rawUrl: string, depth: number, parentUrl = site): Promise<void> {
    if (depth > 3)
      return
    const sitemapUrl = resolveSitemapLocation(rawUrl, parentUrl)
    if (!sitemapUrl || !isExpectedOrigin(sitemapUrl))
      return
    if (seenSitemaps.has(sitemapUrl))
      return
    seenSitemaps.add(sitemapUrl)
    fetchedSitemaps.push(sitemapUrl)

    logger?.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
    const fetched = await fetchSitemapText(deps, client, sitemapUrl)
    if (fetched == null) {
      logger?.debug(`Failed to fetch ${sitemapUrl}.`)
      return
    }
    const effectiveUrl = resolveSitemapLocation(fetched.url, sitemapUrl)
    if (!effectiveUrl || !isExpectedOrigin(effectiveUrl)) {
      logger?.debug(`Rejected cross-origin sitemap redirect from ${sitemapUrl}.`)
      return
    }
    if (effectiveUrl !== sitemapUrl && seenSitemaps.has(effectiveUrl))
      return
    seenSitemaps.add(effectiveUrl)

    const document = parseSitemapDocument(fetched.text, {
      contentType: fetched.contentType,
      url: effectiveUrl,
    })
    if (document.kind === 'unknown') {
      const redirect = extractSitemapMetaRefreshUrl(fetched.text, effectiveUrl)
      if (redirect && isExpectedOrigin(redirect))
        await visit(redirect, depth + 1, effectiveUrl)
      else
        logger?.debug(`Fetched ${sitemapUrl}, but it was not a supported sitemap document.`)
      return
    }

    if (document.kind === 'index') {
      for (const loc of document.locations)
        await visit(loc, depth + 1, effectiveUrl)
    }
    else {
      for (const loc of document.locations) {
        const url = resolveSitemapLocation(loc, effectiveUrl)
        if (!url || !isScanOrigin({ siteUrl: deps.siteUrl }, url)) {
          ignored++
          continue
        }
        if (seenPages.has(url))
          continue
        seenPages.add(url)
        paths.push(url)
      }
      logger?.debug(`Fetched ${sitemapUrl} with ${document.locations.length} URLs.`)
    }
  }

  for (const sitemapUrl of new Set(sitemaps))
    await visit(sitemapUrl, 0)

  return { paths, ignored, sitemaps: fetchedSitemaps.length ? fetchedSitemaps : sitemaps }
}

export interface SitemapSeedsOptions {
  resolvedConfig: FetchConfig
  siteUrl: URL
  /** Explicit sitemap URLs, or `true` (default) to discover them. */
  sitemaps?: true | string[]
  /** Discover sitemap URLs from robots.txt when no explicit URLs are configured. */
  robotsTxt?: boolean
  logger?: Logger
}

async function resolveSitemaps(opts: SitemapSeedsOptions): Promise<true | string[]> {
  if (Array.isArray(opts.sitemaps) && opts.sitemaps.length > 0)
    return opts.sitemaps
  if (!opts.robotsTxt)
    return true

  const { origin } = opts.siteUrl
  const robotsUrl = new URL('/robots.txt', origin)
  const { valid, response } = await fetchUrlRaw(robotsUrl.href, opts.resolvedConfig, {
    client: createSitemapClient(opts.resolvedConfig, origin),
    logger: opts.logger,
    timeoutMs: 8_000,
    maxRetries: 1,
  })
  if (!valid || !response || new URL(response.url || robotsUrl).origin !== origin)
    return true

  const locations = parseRobotsTxt(response.data).sitemaps.map(location => resolveSitemapLocation(location, origin))
  const sitemaps = locations.filter((url): url is string => url !== null && new URL(url).origin === origin)
  return sitemaps.length > 0 ? sitemaps : true
}

/**
 * SeedSource that fetches one or more sitemaps and yields each URL.
 *
 * Sitemap fetch failures are logged at debug level; the source yields nothing rather than
 * throwing so the scan can fall back to other seed sources (manual, link-discovery).
 */
export function sitemapSeeds(opts: SitemapSeedsOptions): SeedSource {
  return {
    async* seeds() {
      const logger = opts.logger
      try {
        const { paths } = await extractSitemapRoutes(
          { resolvedConfig: opts.resolvedConfig, siteUrl: opts.siteUrl, logger: opts.logger },
          opts.siteUrl.toString(),
          await resolveSitemaps(opts),
        )
        for (const url of paths)
          yield { url, source: 'sitemap' }
      }
      catch (err) {
        logOperationalWarn('seeds.sitemap_fetch_failed', err, { site: opts.siteUrl.toString() }, logger)
      }
    },
  }
}
