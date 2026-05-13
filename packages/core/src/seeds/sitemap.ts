import type { UnlighthouseContext } from '@unlighthouse/contracts'
import Sitemapper from 'sitemapper'
import { $URL, withBase } from 'ufo'
import { useLogger } from '../util/logger'
import { fetchUrlRaw } from '../util/fetch'
import { isScanOrigin } from '../api/util'

function validSitemapEntry(url: string) {
  return url && (url.startsWith('http') || url.startsWith('/'))
}

/**
 * Fetches routes from a sitemap file.
 */
export async function extractSitemapRoutes(ctx: UnlighthouseContext, site: string, sitemaps: true | (string[])) {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const logger = useLogger()
  if (sitemaps === true || sitemaps.length === 0)
    sitemaps = [`${site}/sitemap.xml`]
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: ctx.resolvedConfig.debug,
  })
  let paths: string[] = []
  for (let sitemapUrl of new Set(sitemaps)) {
    logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
    // make sure it's absolute
    if (!sitemapUrl.startsWith('http'))
      sitemapUrl = withBase(sitemapUrl, site)
    // sitemapper does not support txt sitemaps
    if (sitemapUrl.endsWith('.txt')) {
      const sitemapTxt = await fetchUrlRaw(
        sitemapUrl,
        ctx.resolvedConfig,
      )
      if (sitemapTxt.valid) {
        const sites = (sitemapTxt.response!.data as string).trim().split('\n').filter(validSitemapEntry)
        if (sites?.length)
          paths = [...paths, ...sites]

        logger.debug(`Fetched ${sitemapUrl} with ${sites.length} URLs.`)
      }
    }
    else {
      const { sites } = await sitemap.fetch(sitemapUrl)
      if (sites?.length)
        paths = [...paths, ...sites]
      logger.debug(`Fetched ${sitemapUrl} with ${sites?.length || '0'} URLs.`)
    }
  }
  const filtered = paths.filter(url => isScanOrigin(ctx, url))
  // for the paths we need to validate that they will be scanned
  return { paths: filtered, ignored: paths.length - filtered.length, sitemaps }
}
