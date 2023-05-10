import Sitemapper from 'sitemapper'
import { $URL, withBase } from 'ufo'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'

/**
 * Fetches routes from a sitemap file.
 */
export async function extractSitemapRoutes(site: string, sitemaps: true | (string[])) {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const unlighthouse = useUnlighthouse()
  const logger = useLogger()
  if (sitemaps === true || sitemaps.length === 0)
    sitemaps = [`${site}/sitemap.xml`]
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: unlighthouse.resolvedConfig.debug,
  })
  let paths: string[] = []
  for (let sitemapUrl of new Set(sitemaps)) {
    logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
    // make sure it's absolute
    if (!sitemapUrl.startsWith('http'))
      sitemapUrl = withBase(sitemapUrl, site)
    const { sites } = await sitemap.fetch(sitemapUrl)
    if (sites.length)
      paths = [...paths, ...sites]

    logger.debug(`Fetched sitemap with ${sites.length} URLs.`)
  }
  return paths
}
