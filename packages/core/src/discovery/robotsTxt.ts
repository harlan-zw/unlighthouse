import type { ResolvedUserConfig } from '../types'
import type { RobotsGroupResolved } from '../util/robotsTxtParser'
import { $URL } from 'ufo'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'
import { fetchUrlRaw } from '../util'

export interface RobotsTxtParsed {
  sitemaps: string[]
  groups: RobotsGroupResolved[]
}

function isValidRegex(s: string | RegExp) {
  if (typeof s === 'string') {
    // make sure it's valid regex
    try {
      // eslint-disable-next-line no-new
      new RegExp(s)
      return true
    }
    catch (e) {
      return false
    }
  }
  return true
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

export function mergeRobotsTxtConfig(config: ResolvedUserConfig, { groups, sitemaps }: RobotsTxtParsed): void {
  const normalisedGroups = groups
    .filter(group => group.userAgent.includes('*'))
    .map((group) => {
      for (const k of ['disallow', 'allow']) {
        // @ts-expect-error untyped
        group[k] = (group[k] as string[])
          // skip any disallows that are root level
          .filter(path => path !== '/' && path)
          .map((path) => {
            // convert robots.txt paths to regex paths
            if (path.includes('*'))
              path = path.replace(/\*/g, '.*')
            else
              path = `${path}.*`
            return path
          })
      }
      return group
    })

  // for diallow we add it to the exclude list
  config.scanner.exclude = [...new Set([
    ...(config.scanner.exclude || []),
    ...normalisedGroups.flatMap(group => group.disallow),
  ])].filter(isValidRegex)
  config.scanner.include = config.scanner.include || []
  const robotsAllows = normalisedGroups.flatMap(group => group.allow).filter(a => a.length)
  if (!config.scanner.include.length && robotsAllows.length) {
    config.scanner.include = [...new Set([
      '/*',
      ...normalisedGroups.flatMap(group => group.allow),
    ])].filter(isValidRegex)
  }
  if (config.scanner.sitemap !== false && sitemaps.length) {
    // allow overriding the robots.txt sitemaps with your own
    if (!Array.isArray(config.scanner.sitemap) || !config.scanner.sitemap.length)
      config.scanner.sitemap = [...new Set([...(Array.isArray(config.scanner.sitemap) ? config.scanner.sitemap : []), ...sitemaps])]
  }
}
