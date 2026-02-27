import type { NormalisedRoute, ResolvedUserConfig } from '../types'
import { HttpCrawler, log, PlaywrightCrawler, purgeDefaultStorages } from 'crawlee'
import { groupBy, sampleSize } from 'lodash-es'
import { discoverInitialUrls, matchPathToRule } from '../discovery'
import { useLogger } from '../logger'
import { isScanOrigin, normaliseRoute } from '../router'
import { useUnlighthouse } from '../unlighthouse'
import { createFilter, isImplicitOrExplicitHtml } from '../util/filter'

export interface CrawlProgress {
  status: 'discovering' | 'crawling' | 'filtering' | 'completed'
  found: number
  processed: number
  currentUrl?: string
}

export interface DiscoverUrlsConfig {
  startUrls: string[]
  maxUrls?: number
  followLinks?: boolean
  maxDepth?: number
  skipJavascript?: boolean
  onProgress?: (progress: CrawlProgress) => void
}

/**
 * Phase 1: URL Discovery using Crawlee
 * Discovers all URLs from a site using HTTP or Playwright crawling
 */
export async function discoverUrlsViaCrawlee(config: DiscoverUrlsConfig): Promise<Set<string>> {
  const logger = useLogger()
  const { resolvedConfig } = useUnlighthouse()
  const discoveredUrls = new Set<string>()

  // Add starting URLs to discovered set
  config.startUrls.forEach(url => discoveredUrls.add(url))

  // Set crawlee log level based on debug flag
  log.setLevel(resolvedConfig.debug ? log.LEVELS.INFO : log.LEVELS.OFF)

  const progress: CrawlProgress = {
    status: 'discovering',
    found: discoveredUrls.size,
    processed: 0,
  }

  // Basic URL filter for crawling - just checks same origin
  const shouldEnqueueUrl = (url: string): boolean => {
    if (!isScanOrigin(url))
      return false
    if (discoveredUrls.has(url))
      return false
    return true
  }

  const createHttpHandler = () => async ({ request, enqueueLinks }: any) => {
    const url = request.loadedUrl || request.url
    discoveredUrls.add(url)

    progress.found = discoveredUrls.size
    progress.processed++
    progress.currentUrl = url
    config.onProgress?.(progress)

    logger.debug(`Discovered URL: ${url}`)

    if (config.followLinks && (request.userData?.depth || 0) < (config.maxDepth || 1)) {
      const currentDepth = (request.userData?.depth || 0) + 1

      await enqueueLinks({
        strategy: 'same-domain',
        transformRequestFunction: (req: any) => {
          if (!shouldEnqueueUrl(req.url))
            return false
          req.userData = { depth: currentDepth }
          return req
        },
      })
    }
  }

  const createPlaywrightHandler = () => async ({ request, page, enqueueLinks }: any) => {
    await page.waitForLoadState('networkidle')
    const url = request.loadedUrl || request.url
    discoveredUrls.add(url)

    progress.found = discoveredUrls.size
    progress.processed++
    progress.currentUrl = url
    config.onProgress?.(progress)

    logger.debug(`Discovered URL: ${url}`)

    if (config.followLinks && (request.userData?.depth || 0) < (config.maxDepth || 1)) {
      const currentDepth = (request.userData?.depth || 0) + 1

      await enqueueLinks({
        strategy: 'same-domain',
        transformRequestFunction: (req: any) => {
          if (!shouldEnqueueUrl(req.url))
            return false
          req.userData = { depth: currentDepth }
          return req
        },
      })
    }
  }

  const errorHandler = async ({ request, error }: any) => {
    logger.debug(`Failed to crawl ${request.url}: ${error?.message || 'Unknown error'}`)
  }

  const crawlerOptions = {
    errorHandler,
    maxRequestsPerCrawl: config.maxUrls || Number.MAX_SAFE_INTEGER,
    respectRobotsTxtFile: false, // We handle robots.txt checking in filtering phase
  }

  // Choose crawler based on skipJavascript setting
  const crawler = config.skipJavascript
    ? new HttpCrawler({
        ...crawlerOptions,
        requestHandler: createHttpHandler(),
      })
    : new PlaywrightCrawler({
        ...crawlerOptions,
        requestHandler: createPlaywrightHandler(),
      })

  const initialRequests = config.startUrls.map(url => ({
    url,
    userData: { depth: 0 },
  }))

  progress.status = 'crawling'
  config.onProgress?.(progress)

  await crawler.run(initialRequests)
    .catch((error) => {
      logger.error(`Crawler error: ${error?.message || 'Unknown error'}`)
    })

  await purgeDefaultStorages()

  progress.status = 'completed'
  config.onProgress?.(progress)

  return discoveredUrls
}

/**
 * Phase 2: Filter discovered URLs
 * Applies robots.txt, include/exclude patterns, HTML validation, dynamic sampling, and maxRoutes
 */
export function filterUrls(urls: Set<string>, resolvedConfig: ResolvedUserConfig): NormalisedRoute[] {
  const logger = useLogger()

  // Convert to array and validate origin
  let validUrls = [...urls].filter(url => isScanOrigin(url))
  logger.debug(`After origin filter: ${validUrls.length} URLs`)

  // Apply include/exclude patterns
  if (resolvedConfig.scanner.include || resolvedConfig.scanner.exclude) {
    const filter = createFilter(resolvedConfig.scanner)
    validUrls = validUrls.filter((url) => {
      const path = new URL(url).pathname
      const passes = filter(path)
      if (!passes)
        logger.debug(`Excluded by include/exclude pattern: ${path}`)
      return passes
    })
    logger.debug(`After include/exclude filter: ${validUrls.length} URLs`)
  }

  // Apply robots.txt rules
  if (resolvedConfig.scanner.robotsTxt && resolvedConfig.scanner._robotsTxtRules?.length) {
    validUrls = validUrls.filter((url) => {
      const path = new URL(url).pathname
      const rule = matchPathToRule(path, resolvedConfig.scanner._robotsTxtRules)
      if (rule && !rule.allow) {
        logger.debug(`Blocked by robots.txt rule "${rule.pattern}": ${path}`)
        return false
      }
      return true
    })
    logger.debug(`After robots.txt filter: ${validUrls.length} URLs`)
  }

  // Apply HTML type validation
  validUrls = validUrls.filter((url) => {
    const path = new URL(url).pathname
    const isHtml = isImplicitOrExplicitHtml(path)
    if (!isHtml)
      logger.debug(`Skipped non-HTML file: ${path}`)
    return isHtml
  })
  logger.debug(`After HTML filter: ${validUrls.length} URLs`)

  // Convert to normalised routes
  let routes = validUrls.map(url => normaliseRoute(url))

  // Apply dynamic sampling if enabled
  if (resolvedConfig.scanner.dynamicSampling && resolvedConfig.scanner.dynamicSampling > 0) {
    const pathsChunkedToGroup = groupBy(
      routes,
      resolvedConfig.client.groupRoutesKey.replace('route.', ''),
    )

    let warnedAboutSampling = false
    const sampledRoutes = Object.values(pathsChunkedToGroup).flatMap((group) => {
      const { dynamicSampling } = resolvedConfig.scanner
      if (!dynamicSampling)
        return group

      if (!warnedAboutSampling && group.length > dynamicSampling) {
        logger.warn('Dynamic sampling is in effect, some of your routes will not be scanned. To disable this behavior, set `scanner.dynamicSampling` to `false`.')
        warnedAboutSampling = true
      }

      return sampleSize(group, dynamicSampling)
    })

    routes = sampledRoutes
    logger.debug(`After dynamic sampling: ${routes.length} routes`)
  }

  // Apply maxRoutes limit
  if (resolvedConfig.scanner.maxRoutes !== false && routes.length > resolvedConfig.scanner.maxRoutes) {
    logger.warn(`Limiting to ${resolvedConfig.scanner.maxRoutes} routes (discovered ${routes.length}). Increase \`scanner.maxRoutes\` to scan more.`)
    routes = routes.slice(0, resolvedConfig.scanner.maxRoutes)
  }

  return routes
}

/**
 * Main crawl orchestration - Two-phase URL discovery and filtering
 *
 * Phase 1: URL Discovery
 * - Sitemap.xml parsing (if enabled)
 * - Manual URLs (if config.urls)
 * - Crawlee crawl (if scanner.crawler)
 * - Merge & deduplicate
 *
 * Phase 2: Filtering
 * - Apply robots.txt rules
 * - Apply include/exclude patterns
 * - Apply HTML type validation
 * - Apply dynamicSampling
 * - Apply maxRoutes limit
 */
export async function crawlSite(onProgress?: (progress: CrawlProgress) => void): Promise<NormalisedRoute[]> {
  const logger = useLogger()
  const { resolvedConfig } = useUnlighthouse()

  logger.info('Starting URL discovery phase...')

  // Phase 1: Collect initial URLs from sitemap, manual config, route definitions
  const initialUrls = await discoverInitialUrls()
  logger.info(`Initial discovery: ${initialUrls.size} URLs from sitemap/config`)

  // Phase 1b: Discover more URLs via Crawlee if crawler is enabled
  let allUrls = initialUrls
  if (resolvedConfig.scanner.crawler) {
    logger.info('Starting Crawlee crawler for additional URL discovery...')

    const crawledUrls = await discoverUrlsViaCrawlee({
      startUrls: [...initialUrls],
      maxUrls: typeof resolvedConfig.scanner.maxRoutes === 'number'
        ? resolvedConfig.scanner.maxRoutes * 2 // Crawl more than maxRoutes since we'll filter
        : undefined,
      followLinks: true,
      maxDepth: 10, // Reasonable depth limit for crawling
      skipJavascript: resolvedConfig.scanner.skipJavascript,
      onProgress,
    })

    // Merge discovered URLs
    allUrls = new Set([...initialUrls, ...crawledUrls])
    logger.info(`Crawlee discovered ${crawledUrls.size - initialUrls.size} additional URLs (total: ${allUrls.size})`)
  }

  // Phase 2: Filter and convert to routes
  logger.info('Filtering discovered URLs...')
  const routes = filterUrls(allUrls, resolvedConfig)

  logger.info(`${routes.length} routes ready for Lighthouse auditing`)

  return routes
}
