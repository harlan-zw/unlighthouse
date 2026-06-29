import { siteSlug } from '~/utils/site'

interface SiteLike {
  url: string
}

/** Resolve a slug back to a full origin URL usable in history.list({ site }). */
export function resolveSiteUrl(slug: string, sites: SiteLike[]): string {
  const matches = sites.filter(s => siteSlug(s.url) === slug)
  if (matches.length) {
    const https = matches.find(s => s.url.startsWith('https://'))
    return (https ?? matches[0]!).url
  }
  return `https://${slug}`
}
