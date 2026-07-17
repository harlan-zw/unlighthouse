import type { Logger, ResolvedUserConfig } from '@unlighthouse/contracts'
import type { SeedSource } from '@unlighthouse/contracts/ports'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { isScanOrigin } from '../api/util'
import { fetchUrlRaw } from '../util/fetch'
import { extractSitemapMetaRefreshUrl, parseSitemapDocument, resolveSitemapLocation } from './sitemap-parser'

export interface ExtractSitemapDeps {
  resolvedConfig: ResolvedUserConfig
  siteUrl: URL
  logger?: Logger
}

interface FetchedSitemapText {
  contentType: string | null
  text: string
  url: string
}

async function fetchSitemapText(deps: ExtractSitemapDeps, sitemapUrl: string): Promise<FetchedSitemapText | null> {
  const fetched = await fetchUrlRaw(
    sitemapUrl,
    deps.resolvedConfig,
    { logger: deps.logger },
  )
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
    const fetched = await fetchSitemapText(deps, sitemapUrl)
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
  resolvedConfig: ResolvedUserConfig
  siteUrl: URL
  /** Sitemap URLs to fetch. `true` (default) resolves to `${site}/sitemap.xml`. */
  sitemaps?: true | string[]
  logger?: Logger
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
          opts.sitemaps ?? true,
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
