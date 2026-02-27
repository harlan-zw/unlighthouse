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

interface RobotsTxtRule { pattern: string, allow: boolean }

function matches(pattern: string, path: string): boolean {
  const pathLength = path.length
  const patternLength = pattern.length
  const matchingLengths = Array.from({ length: pathLength + 1 }).fill(0) as number[]
  let numMatchingLengths = 1

  let p = 0
  while (p < patternLength) {
    if (pattern[p] === '$' && p + 1 === patternLength) {
      return matchingLengths[numMatchingLengths - 1] === pathLength
    }

    if (pattern[p] === '*') {
      numMatchingLengths = pathLength - matchingLengths[0] + 1
      for (let i = 1; i < numMatchingLengths; i++) {
        matchingLengths[i] = matchingLengths[i - 1] + 1
      }
    }
    else {
      let numMatches = 0
      for (let i = 0; i < numMatchingLengths; i++) {
        const matchLength = matchingLengths[i]
        if (matchLength < pathLength && path[matchLength] === pattern[p]) {
          matchingLengths[numMatches++] = matchLength + 1
        }
      }
      if (numMatches === 0) {
        return false
      }
      numMatchingLengths = numMatches
    }
    p++
  }

  return true
}
export function matchPathToRule(path: string, _rules: RobotsTxtRule[]): RobotsTxtRule | null {
  let matchedRule: RobotsTxtRule | null = null

  const rules = _rules.filter(Boolean) // filter out empty line such as Disallow:
  const rulesLength = rules.length
  let i = 0
  while (i < rulesLength) {
    const rule = rules[i]
    if (!matches(rule.pattern, path)) {
      i++
      continue
    }

    if (!matchedRule || rule.pattern.length > matchedRule.pattern.length) {
      matchedRule = rule
    }
    else if (
      rule.pattern.length === matchedRule.pattern.length
      && rule.allow
      && !matchedRule.allow
    ) {
      matchedRule = rule
    }
    i++
  }

  return matchedRule || {
    pattern: '',
    allow: true,
  }
}

export function mergeRobotsTxtConfig(config: ResolvedUserConfig, { groups, sitemaps }: RobotsTxtParsed): void {
  config.scanner._robotsTxtRules = groups.filter((group) => {
    return group.userAgent.includes('*') || group.userAgent.includes(String(config.lighthouseOptions?.emulatedUserAgent))
  }).flatMap(group => group._rules)
  if (config.scanner.sitemap !== false && sitemaps.length) {
    // allow overriding the robots.txt sitemaps with your own
    if (!Array.isArray(config.scanner.sitemap) || !config.scanner.sitemap.length)
      config.scanner.sitemap = [...new Set([...(Array.isArray(config.scanner.sitemap) ? config.scanner.sitemap : []), ...sitemaps])]
  }
}
