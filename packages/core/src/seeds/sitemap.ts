import type { Logger, ResolvedUserConfig } from '@unlighthouse/contracts'
import type { ConsolaInstance } from 'consola'
import { createConsola } from 'consola'
import Sitemapper from 'sitemapper'
import { $URL, withBase } from 'ufo'
import { isScanOrigin } from '../api/util'
import { fetchUrlRaw } from '../util/fetch'

function validSitemapEntry(url: string) {
  return url && (url.startsWith('http') || url.startsWith('/'))
}

export interface ExtractSitemapDeps {
  resolvedConfig: ResolvedUserConfig
  siteUrl: URL
  logger?: Logger
}

/**
 * Fetches routes from a sitemap file.
 */
export async function extractSitemapRoutes(deps: ExtractSitemapDeps, site: string, sitemaps: true | (string[])) {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const logger = (deps.logger as ConsolaInstance | undefined) ?? createConsola().withTag('unlighthouse')
  if (sitemaps === true || sitemaps.length === 0)
    sitemaps = [`${site}/sitemap.xml`]
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: deps.resolvedConfig.debug,
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
        deps.resolvedConfig,
        { logger: deps.logger },
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
  const filtered = paths.filter(url => isScanOrigin({ siteUrl: deps.siteUrl }, url))
  // for the paths we need to validate that they will be scanned
  return { paths: filtered, ignored: paths.length - filtered.length, sitemaps }
}
