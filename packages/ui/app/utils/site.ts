// Site URL ⇆ slug helpers. We use a pretty hostname slug in the address bar
// (`/sites/example.com`) instead of the raw encoded-origin siteId. The full
// origin needed for `history.list({ site })` is resolved from the registry by
// matching hostname, preferring https on the rare http+https collision and
// falling back to `https://{slug}` when the site was deleted from the registry
// but its scans remain.

interface SiteLike {
  url: string
}

/** The address-bar slug for a site URL — just its hostname. */
export function siteSlug(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
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
