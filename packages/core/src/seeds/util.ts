import type { Logger, NormalisedRoute, ResolvedUserConfig } from '@unlighthouse/contracts'
import type { ConsolaInstance } from 'consola'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createConsola } from 'consola'
import { fetchRobotsTxt, mergeRobotsTxtConfig } from '../policies/robots'
import { parseRobotsTxt } from '../policies/robots/parser'
import { extractSitemapRoutes } from './sitemap'

export interface DiscoverInitialUrlsDeps {
  resolvedConfig: ResolvedUserConfig
  siteUrl: URL
  logger?: Logger
}

let warnedAboutSampling = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

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

function getPathValue(source: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((current, part) => {
    if (!isRecord(current))
      return undefined
    return current[part]
  }, source)
}

function groupRoutesBy(routes: NormalisedRoute[], getKey: (route: NormalisedRoute) => string): Record<string, NormalisedRoute[]> {
  const grouped: Record<string, NormalisedRoute[]> = {}
  for (const route of routes) {
    const key = getKey(route)
    grouped[key] ||= []
    grouped[key].push(route)
  }
  return grouped
}

/**
 * Discover initial URLs from sitemap, manual config, and route definitions.
 * Returns raw URLs before filtering (for use with Crawlee two-phase architecture).
 */
export async function discoverInitialUrls(deps: DiscoverInitialUrlsDeps): Promise<Set<string>> {
  const logger = (deps.logger as ConsolaInstance | undefined) ?? createConsola().withTag('unlighthouse')
  const { resolvedConfig } = deps

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
    const robotsTxt = await fetchRobotsTxt({ resolvedConfig, logger: deps.logger }, resolvedConfig.site)
    if (robotsTxt) {
      const robotsTxtParsed = parseRobotsTxt(robotsTxt)
      logger.info(`Found /robots.txt, using entries. Sitemaps: ${robotsTxtParsed.sitemaps.length}, Groups: ${robotsTxtParsed.groups.length}.`)
      mergeRobotsTxtConfig(resolvedConfig, robotsTxtParsed)
    }
  }

  // Extract URLs from sitemap
  if (resolvedConfig.scanner.sitemap !== false) {
    const { paths: sitemapUrls, ignored, sitemaps } = await extractSitemapRoutes({ resolvedConfig, siteUrl: deps.siteUrl, logger: deps.logger }, resolvedConfig.site, resolvedConfig.scanner.sitemap)
    if (ignored > 0 && !sitemapUrls.length) {
      logOperationalWarn('seeds.sitemap_origin_mismatch', null, { ignored, sitemaps }, logger)
    }
    else if (sitemapUrls.length) {
      logger.info(`Discovered ${sitemapUrls.length} routes from ${sitemaps.length} sitemap${sitemaps.length > 1 ? 's' : ''}.`)
      if (ignored > 0)
        logOperationalWarn('seeds.sitemap_origin_mismatch', null, { ignored, sitemaps }, logger)
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
export function applyDynamicSampling(deps: { resolvedConfig: ResolvedUserConfig, logger?: Logger }, routes: NormalisedRoute[]): NormalisedRoute[] {
  const logger = (deps.logger as ConsolaInstance | undefined) ?? createConsola().withTag('unlighthouse')
  const { resolvedConfig } = deps

  if (!resolvedConfig.scanner.dynamicSampling)
    return routes

  const pathsChunkedToGroup = groupRoutesBy(
    routes,
    (route: NormalisedRoute) => String(getPathValue(route, resolvedConfig.client.groupRoutesKey.replace('route.', ''))),
  )

  const sampledRoutes = Object.values(pathsChunkedToGroup).map(
    (group: NormalisedRoute[]) => {
      const { dynamicSampling } = resolvedConfig.scanner
      if (!dynamicSampling)
        return group

      if (!warnedAboutSampling && group.length > dynamicSampling) {
        logOperationalWarn('seeds.dynamic_sampling_applied', null, { routes: group.length, sampleSize: dynamicSampling }, logger)
        warnedAboutSampling = true
      }

      return sampleRoutes(group, dynamicSampling)
    },
  )

  return sampledRoutes.flat()
}
