import { groupBy, map, sampleSize } from 'lodash-es'
import type { NormalisedRoute } from '../types'
import { useUnlighthouse } from '../unlighthouse'
import { isScanOrigin, normaliseRoute } from '../router'
import { useLogger } from '../logger'
import { extractSitemapRoutes } from './sitemap'
import { fetchRobotsTxt, mergeRobotsTxtConfig, parseRobotsTxt } from './robotsTxt'

let warnedAboutSampling = false

/**
 * Discover the initial routes that we'll be working with.
 *
 * The order by preference for route discovery is as follows:
 * - manual: User provided an array of URLs they want to queue
 * - sitemap: We will scan their sitemap.xml to discover all of their indexable URLs
 * - crawl: We process the root route and queue any discovered internal links
 */
export const resolveReportableRoutes: () => Promise<NormalisedRoute[]> = async () => {
  const logger = useLogger()
  const { resolvedConfig, hooks, worker, routeDefinitions } = useUnlighthouse()

  const urls = new Set<string>([resolvedConfig.site])
  // the urls function may be null
  if (resolvedConfig.urls) {
    let urlsToAdd
    if (typeof resolvedConfig.urls === 'function')
      urlsToAdd = [...(await resolvedConfig.urls())]
    else
      urlsToAdd = [...resolvedConfig.urls]

    urlsToAdd.forEach(url => urls.add(url))
    if (urlsToAdd.length) {
      resolvedConfig.scanner.sitemap = false
      resolvedConfig.scanner.crawler = false
      resolvedConfig.scanner.dynamicSampling = false
      logger.info(`The \`url\` config has been provided with ${urlsToAdd.length} paths for scanning. Disabling sitemap, sampling and crawler.`)
    }
  }

  if (resolvedConfig.scanner.robotsTxt) {
    const robotsTxt = await fetchRobotsTxt(resolvedConfig.site)
    if (robotsTxt) {
      const robotsTxtParsed = parseRobotsTxt(robotsTxt)
      logger.info(`Found /robots.txt, using entries. Sitemaps: ${robotsTxtParsed.sitemaps.length}, Disallow: ${robotsTxtParsed.disallows.length}.`)
      // merges disallow and sitemap into the `scanner.exclude` and `scanner.sitemaps` options respectively
      mergeRobotsTxtConfig(resolvedConfig, robotsTxtParsed)
    }
  }

  // if sitemap scanning is enabled
  if (resolvedConfig.scanner.sitemap !== false) {
    const sitemapUrls = await extractSitemapRoutes(resolvedConfig)
    if (sitemapUrls.length) {
      logger.info(`Discovered ${sitemapUrls.length} routes from sitemap.xml.`)
      sitemapUrls.forEach(url => urls.add(url))
      // sitemap threshold for disabling crawler
      if (sitemapUrls.length >= 50) {
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

  // add static routes from definitions if the sitemap failed
  if (urls.size <= 1 && routeDefinitions?.length) {
    routeDefinitions
      .filter(r => !r.path.includes(':'))
      .map(r => r.path)
      .forEach(url => urls.add(url))
  }

  // setup this hook to queue any discovered internal links
  if (resolvedConfig.scanner.crawler) {
    hooks.hook('discovered-internal-links', (path, internalLinks) => {
      // sanity check the internal links, may need javascript to run
      if (path === '/' && internalLinks.length <= 0 && resolvedConfig.scanner.skipJavascript) {
        resolvedConfig.scanner.skipJavascript = false
        resolvedConfig.cache = false
        worker.routeReports.clear()
        worker.queueRoute(normaliseRoute(path))
        logger.warn('No internal links discovered on home page. Switching crawler to execute javascript and disabling cache.')
        return
      }
      worker.queueRoutes(internalLinks.map(url => normaliseRoute(url)).map((route) => {
        // keep track of where we discovered this route
        route.discoveredFrom = path
        return route
      }))
    })
  }

  // ensure the urls are for the right domain
  const validUrls = [...urls.values()].filter(url => isScanOrigin(url))

  if (!resolvedConfig.scanner.dynamicSampling)
    return validUrls.map(url => normaliseRoute(url))

  // group all urls by their route definition path name
  const pathsChunkedToGroup = groupBy(
    validUrls.map(url => normaliseRoute(url)),
    resolvedConfig.client.groupRoutesKey.replace('route.', ''),
  )

  const pathsSampleChunkedToGroup = map(
    pathsChunkedToGroup,
    // we're matching dynamic rates here, only taking a sample to avoid duplicate tests
    (group) => {
      const { dynamicSampling } = resolvedConfig.scanner
      // allow config to bypass this behavior
      if (!dynamicSampling)
        return group

      if (!warnedAboutSampling && group.length > dynamicSampling) {
        logger.warn('Dynamic sampling is in effect, some of your routes will not be scanned. To disable this behavior, set `scanner.dynamicSampling` to `false`.')
        warnedAboutSampling = true
      }

      // whatever the sampling rate is
      return sampleSize(group, dynamicSampling)
    })

  return pathsSampleChunkedToGroup.flat()
}
