import Sitemapper from 'sitemapper'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'
import {$URL} from "ufo";

/**
 * Fetches routes from a sitemap file.
 *
 * @param site
 */
export const extractSitemapRoutes = async(site: string) => {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const unlighthouse = useUnlighthouse()
  const logger = useLogger()
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: unlighthouse.resolvedConfig.debug,
  })

  const sitemapUrl = `${site}/sitemap.xml`
  logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
  const { sites } = await sitemap.fetch(sitemapUrl)
  logger.debug(`Fetched sitemap with ${sites.length} URLs.`)
  return sites
}
