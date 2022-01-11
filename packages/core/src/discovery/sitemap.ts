import Sitemapper from 'sitemapper'
import { useLogger } from '../logger'

/**
 * Fetches routes from a sitemap file.
 *
 * @param site
 */
export const extractSitemapRoutes = async(site: string) => {
  const logger = useLogger()
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
  })

  const sitemapUrl = `${site}/sitemap.xml`
  logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
  const { sites } = await sitemap.fetch(sitemapUrl)
  logger.debug(`Fetched sitemap with ${sites.length} URLs.`)
  return sites
}
