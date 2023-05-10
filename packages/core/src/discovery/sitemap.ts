import Sitemapper from 'sitemapper'
import { $URL } from 'ufo'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'
import { fetchUrlRaw } from '../util'

/**
 * Fetches routes from a sitemap file.
 *
 * @param site
 */
export const extractSitemapRoutes = async (site: string) => {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const unlighthouse = useUnlighthouse()
  const logger = useLogger()
  let sitemaps = [`${site}/sitemap.xml`]
  // we scan the robots.txt content for the sitemaps
  logger.debug(`Checking ${site}/robots.txt for Sitemap URLs`)
  const robotsTxt = await fetchUrlRaw(
    `${site}/robots.txt`,
    unlighthouse.resolvedConfig,
  )
  if (robotsTxt.valid) {
    const sitemapUrls = robotsTxt.response?.data.split('\n')
      .filter(line => line.startsWith('Sitemap'))
      // split only on the first instance of :
      .map(line => line.split(/:(.+)/)[1].trim())
    if (sitemapUrls.length > 0)
      sitemaps = sitemapUrls
  }
  else {
    logger.warn('You seem to be missing a robots.txt.')
  }
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: unlighthouse.resolvedConfig.debug,
  })
  let paths = []
  for (const sitemapUrl of sitemaps) {
    logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
    const { sites } = await sitemap.fetch(sitemapUrl)
    if (sites.length)
      paths = [...paths, ...sites]

    logger.debug(`Fetched sitemap with ${sites.length} URLs.`)
  }
  return paths
}
