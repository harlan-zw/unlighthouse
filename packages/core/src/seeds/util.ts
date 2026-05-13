import type { NormalisedRoute, UnlighthouseContext } from '@unlighthouse/contracts'
import { get, groupBy } from 'lodash-es'
import { useLogger } from '../util/logger'
import { isScanOrigin, normaliseRoute } from '../api/util'
import { fetchRobotsTxt, mergeRobotsTxtConfig } from '../policies/robots'
import { parseRobotsTxt } from '../policies/robots/parser'
import { extractSitemapRoutes } from './sitemap'

let warnedAboutSampling = false

function sampleRoutes(routes: NormalisedRoute[], size: number): NormalisedRoute[] {
  if (routes.length <= size)
    return routes
  const shuffled = [...routes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = current
  }
  return shuffled.slice(0, size)
}

/**
 * Discover initial URLs from sitemap, manual config, and route definitions.
 * Returns raw URLs before filtering (for use with Crawlee two-phase architecture).
 */
export async function discoverInitialUrls(ctx: UnlighthouseContext): Promise<Set<string>> {
  const logger = useLogger()
  const { resolvedConfig } = ctx

  const urls = new Set<string>([])

  // Manual URLs from config
  if (resolvedConfig.urls?.length) {
    let urlsToAdd
    if (typeof resolvedConfig.urls === 'function')
      urlsToAdd = [...(await resolvedConfig.urls())]
    else
      urlsToAdd = [...resolvedConfig.urls]

    urlsToAdd.forEach((url) => {
      // Resolve relative paths against the configured site so downstream URL parsing works
      if (url.startsWith('/') && !url.startsWith('//') && resolvedConfig.site)
        urls.add(new URL(url, resolvedConfig.site).toString())
      else
        urls.add(url)
    })
    if (urlsToAdd.length) {
      resolvedConfig.scanner.sitemap = false
      resolvedConfig.scanner.robotsTxt = false
      resolvedConfig.scanner.crawler = false
      resolvedConfig.scanner.dynamicSampling = false
      logger.info(`The \`url\` config has been provided with ${urlsToAdd.length} paths for scanning. Disabling sitemap, robots, sampling and crawler.`)
    }
  }
  else {
    urls.add(resolvedConfig.site)
  }

  // Process robots.txt
  if (resolvedConfig.scanner.robotsTxt) {
    const robotsTxt = await fetchRobotsTxt(ctx, resolvedConfig.site)
    if (robotsTxt) {
      const robotsTxtParsed = parseRobotsTxt(robotsTxt)
      logger.info(`Found /robots.txt, using entries. Sitemaps: ${robotsTxtParsed.sitemaps.length}, Groups: ${robotsTxtParsed.groups.length}.`)
      mergeRobotsTxtConfig(resolvedConfig, robotsTxtParsed)
    }
  }

  // Extract URLs from sitemap
  if (resolvedConfig.scanner.sitemap !== false) {
    const { paths: sitemapUrls, ignored, sitemaps } = await extractSitemapRoutes(ctx, resolvedConfig.site, resolvedConfig.scanner.sitemap)
    if (ignored > 0 && !sitemapUrls.length) {
      logger.warn(`Sitemap${sitemaps.length > 1 ? 's' : ''} exists but is being ignored due to a different origin being present`)
    }
    else if (sitemapUrls.length) {
      logger.info(`Discovered ${sitemapUrls.length} routes from ${sitemaps.length} sitemap${sitemaps.length > 1 ? 's' : ''}.`)
      if (ignored > 0)
        logger.warn(`Ignoring ${ignored} paths from sitemap as their origin differs from the site url.`)
      sitemapUrls.forEach(url => urls.add(url))
      // sitemap threshold for disabling crawler
      if (!resolvedConfig.site.includes('localhost') && sitemapUrls.length >= 50) {
        resolvedConfig.scanner.crawler = false
        logger.info('Disabling crawler mode as sitemap has been provided.')
      }
    }
    else if (resolvedConfig.scanner.crawler) {
      resolvedConfig.scanner.sitemap = false
      logger.info('Sitemap appears to be missing, falling back to crawler mode.')
    }
    else {
      resolvedConfig.scanner.sitemap = false
      logger.error('Failed to find sitemap.xml and \`routes.crawler\` has been disabled. Please enable the crawler to continue scan.')
    }
  }

  return urls
}

/**
 * Apply dynamic sampling to routes.
 */
export function applyDynamicSampling(ctx: UnlighthouseContext, routes: NormalisedRoute[]): NormalisedRoute[] {
  const logger = useLogger()
  const { resolvedConfig } = ctx

  if (!resolvedConfig.scanner.dynamicSampling)
    return routes

  const pathsChunkedToGroup = groupBy(
    routes,
    (route: NormalisedRoute) => String(get(route, resolvedConfig.client.groupRoutesKey.replace('route.', ''))),
  ) as Record<string, NormalisedRoute[]>

  const sampledRoutes = Object.values(pathsChunkedToGroup).map(
    (group: NormalisedRoute[]) => {
      const { dynamicSampling } = resolvedConfig.scanner
      if (!dynamicSampling)
        return group

      if (!warnedAboutSampling && group.length > dynamicSampling) {
        logger.warn('Dynamic sampling is in effect, some of your routes will not be scanned. To disable this behavior, set `scanner.dynamicSampling` to `false`.')
        warnedAboutSampling = true
      }

      return sampleRoutes(group, dynamicSampling)
    },
  )

  return sampledRoutes.flat()
}

/**
 * Discover the initial routes that we'll be working with.
 * This is the legacy function that combines discovery and filtering.
 *
 * @deprecated Use discoverInitialUrls() + crawlSite filtering instead
 */
export const resolveReportableRoutes: (ctx: UnlighthouseContext) => Promise<NormalisedRoute[]> = async (ctx) => {
  const urls = await discoverInitialUrls(ctx)

  // Ensure URLs are for the right domain
  const validUrls = [...urls.values()].filter(url => isScanOrigin(ctx, url))
  const routes = validUrls.map(url => normaliseRoute(ctx, url))

  return applyDynamicSampling(ctx, routes)
}
