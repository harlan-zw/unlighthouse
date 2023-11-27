export interface RobotsGroupResolved {
  comment: string[]
  disallow: string[]
  allow: string[]
  userAgent: string[]
  host?: string
}

/**
 * We're going to read the robots.txt and extract any disallow or sitemaps rules from it.
 *
 * We're going to use the Google specification, the keys should be checked:
 *
 * - user-agent: identifies which crawler the rules apply to.
 * - allow: a URL path that may be crawled.
 * - disallow: a URL path that may not be crawled.
 * - sitemap: the complete URL of a sitemap.
 * - host: the host name of the site, this is optional non-standard directive.
 *
 * @param s robots.txt file contents
 * @see https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */
export function parseRobotsTxt(s: string) {
  // then we'll extract the disallow and sitemap rules
  const groups: RobotsGroupResolved[] = []
  const sitemaps: string[] = []
  let createNewGroup = false
  let currentGroup: RobotsGroupResolved = {
    comment: [], // comments are too hard to parse in a logical order, we'll just omit them
    disallow: [],
    allow: [],
    userAgent: [],
  }
  // read the contents
  for (const line of s.split('\n')) {
    const sepIndex = line.indexOf(':')
    // may not exist for comments
    if (sepIndex === -1)
      continue
    // get the rule, pop before the first :
    const rule = line.substring(0, sepIndex).trim()
    const val = line.substring(sepIndex + 1).trim()

    switch (rule) {
      case 'User-agent':
        if (createNewGroup) {
          groups.push({
            ...currentGroup,
          })
          currentGroup = <RobotsGroupResolved> {
            comment: [],
            disallow: [],
            allow: [],
            userAgent: [],
          }
          createNewGroup = false
        }
        currentGroup.userAgent.push(val)
        break
      case 'Allow':
        currentGroup.allow.push(val)
        createNewGroup = true
        break
      case 'Disallow':
        currentGroup.disallow.push(val)
        createNewGroup = true
        break
      case 'Sitemap':
        sitemaps.push(val)
        break
      case 'Host':
        currentGroup.host = val
        break
    }
  }
  // push final stack
  groups.push({
    ...currentGroup,
  })
  return {
    groups,
    sitemaps,
  }
}
