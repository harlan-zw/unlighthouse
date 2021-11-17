import Sitemapper from 'sitemapper'
import {useLogger} from "../core";

const { info } = useLogger()
export const extractSitemapRoutes = async(site: string) => {
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
  })

  const sitemapUrl = `${site}/sitemap.xml`
  const { sites } = await sitemap.fetch(sitemapUrl)
  info(`Discovered ${sites.length} urls from ${sitemapUrl}.`)
  return sites
}
