/**
 * i18n / canonical link helpers used by the crawler to avoid auditing duplicate
 * pages and to discover the canonical version of a route.
 *
 * Both helpers are pure (URL string in, URL string / boolean out) so they can be
 * unit-tested without a live crawl.
 */

/** Normalise a URL for equality comparison: absolute form, no trailing slash, no hash. */
export function normaliseUrl(href: string, base?: string): string | undefined {
  try {
    const url = new URL(href, base)
    url.hash = ''
    const path = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host}${path}${url.search}`
  }
  catch (_err) {
    // Unparseable URLs cannot participate in canonical equality.
    return undefined
  }
}

/**
 * A page is an i18n alternate (duplicate) when it declares a
 * `<link rel="alternate" hreflang="x-default">` pointing at a *different* URL
 * than the page itself. The x-default target is the canonical page to scan, so
 * the localized copies are skipped to avoid duplicate audits.
 *
 * Returns `false` when there is no x-default, the x-default is the page itself,
 * or either URL is unparseable (fail-open: scan the page).
 */
export function isI18nAlternatePage(currentUrl: string, xDefaultHref: string | undefined | null): boolean {
  if (!xDefaultHref)
    return false
  const current = normaliseUrl(currentUrl)
  const xDefault = normaliseUrl(xDefaultHref, currentUrl)
  if (!current || !xDefault)
    return false
  return current !== xDefault
}

/**
 * Resolve a `<link rel="canonical">` href to a same-host URL worth also
 * enqueuing for discovery. Returns `undefined` when there is no canonical, it
 * resolves to a different host, or it points back at the current page.
 */
export function sameHostCanonical(currentUrl: string, canonicalHref: string | undefined | null): string | undefined {
  if (!canonicalHref)
    return undefined
  let current: URL
  let canonical: URL
  try {
    current = new URL(currentUrl)
    canonical = new URL(canonicalHref, currentUrl)
  }
  catch (_err) {
    // Fail open: malformed canonical data should not suppress a crawl.
    return undefined
  }
  if (canonical.host !== current.host)
    return undefined
  if (normaliseUrl(canonical.href) === normaliseUrl(current.href))
    return undefined
  return canonical.href
}
