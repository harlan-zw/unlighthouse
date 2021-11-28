import { NormalisedRoute } from '@shared'
import groupBy from 'lodash/groupBy'
import map from 'lodash/map'
import sampleSize from 'lodash/sampleSize'
import { extractSitemapRoutes } from '../../util/sitemap'
import { useUnlighthouseEngine } from '../engine'
import { normaliseRoute } from '../../router'
import { useLogger } from '../logger'

/**
 * Discover the initial routes that we'll be working with.
 *
 * The order by preference for route discovery is as follows:
 * - manual: User provided an array of URLs they want to queue
 * - sitemap: We will scan their sitemap.xml to discover all of their indexable URLs
 * - crawl: We process the root route and queue any discovered internal links
 */
export const resolveReportableRoutes: () => Promise<NormalisedRoute[]> = async() => {
  const logger = useLogger()
  const { resolvedConfig, provider, hooks, worker } = useUnlighthouseEngine()

  // the urls function may be null
  let urls = (provider?.urls ? await provider?.urls() : [resolvedConfig.host])

  // discover some urls to work with ourselves
  const sitemapUrls = await extractSitemapRoutes(resolvedConfig.host)
  if (sitemapUrls.length) {
    logger.info(`Discovered ${sitemapUrls.length} routes from sitemap.xml.`)
    urls = [
      ...urls,
      ...sitemapUrls,
    ]
  } else if (resolvedConfig.scanner.crawler) {
    logger.info(`Sitemap appears to be missing, falling back to crawler mode.`)
  } else {
    logger.error('Failed to find sitemap.xml and \`routes.crawler\` has been disabled. Please enable to do a sitewide scan.')
  }

  // setup this hook to queue any discovered internal links
  if (resolvedConfig.scanner.crawler) {
    hooks.hook('discovered-internal-links', (path, internalLinks) => {
      worker.queueRoutes(internalLinks.map(url => normaliseRoute(url)))
    })
  }

  if (!resolvedConfig.scanner.dynamicSampling)
    return urls.map(url => normaliseRoute(url))

  // group all urls by their route definition path name
  const pathsChunkedToGroup = groupBy(
    urls.map(url => normaliseRoute(url)),
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

      // whatever the sampling rate is
      return sampleSize(group, dynamicSampling)
    })

  return pathsSampleChunkedToGroup.flat()
}
