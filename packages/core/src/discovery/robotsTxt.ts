import { $URL } from 'ufo'
import type { ResolvedUserConfig } from '../types'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'
import { fetchUrlRaw } from '../util'

export interface RobotsTxtParsed {
  sitemaps: string[]
  disallows: string[]
}

/**
 * Fetches the robots.txt file.
 * @param site
 */
export async function fetchRobotsTxt(site: string): Promise<false | string> {
  site = new $URL(site).origin
  const unlighthouse = useUnlighthouse()
  const logger = useLogger()
  // we scan the robots.txt content for the sitemaps
  logger.debug(`Scanning ${site}/robots.txt`)
  const robotsTxt = await fetchUrlRaw(
    `${site}/robots.txt`,
    unlighthouse.resolvedConfig,
  )
  if (!robotsTxt.valid || !robotsTxt.response) {
    logger.warn('You seem to be missing a robots.txt.')
    return false
  }
  logger.debug('Found robots.txt')
  return robotsTxt.response.data as string
}

/**
 * Parses the robots.txt data.
 */
export function parseRobotsTxt(robotsTxt: string): RobotsTxtParsed {
  const lines = robotsTxt
    // URLs are case-insensitive, avoid issues if robots has SITEMAP:
    .toLowerCase()
    .split('\n')
  // make sure we're working from the host name
  const sitemaps = lines
    .filter(line => line.startsWith('sitemap'))
    // split only on the first instance of :
    .map(line => line.split(/:(.+)/)[1].trim())
  // get excludes
  const disallows = lines
    .filter(line => line.startsWith('disallow'))
    // split only on the first instance of :
    .map((line) => {
      const sections = line.trim().split(/:(.+)/)
      if (sections.length >= 2) {
        const [, path] = sections
        return path.trim()
      }
      return false
    })
    .filter(Boolean) as string[]
  return {
    sitemaps,
    disallows,
  }
}

export function mergeRobotsTxtConfig(config: ResolvedUserConfig, { disallows, sitemaps }: RobotsTxtParsed): void {
  // for diallow we add it to the exclude list
  if (disallows.length) {
    // skip any disallows that are root level
    disallows = disallows.filter(path => path !== '/')
    // convert robots.txt paths to regex paths
    disallows = disallows.map((path) => {
      if (path.includes('*'))
        path = path.replace(/\*/g, '.*')
      else
        path = `${path}.*`
      return path
    })
    config.scanner.exclude = [...new Set([...(config.scanner.exclude || []), ...disallows])]
  }

  if (config.scanner.sitemap !== false && sitemaps.length)
    config.scanner.sitemap = [...new Set([...(Array.isArray(config.scanner.sitemap) ? config.scanner.sitemap : []), ...sitemaps])]
}
