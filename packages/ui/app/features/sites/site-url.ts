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

/** A history/scan `site` value's origin, or null when it isn't a parseable URL. */
export function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  }
  catch (_err) {
    // Malformed site labels cannot be grouped by origin.
    return null
  }
}
