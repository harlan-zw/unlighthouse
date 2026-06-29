// Site URL -> slug helper. We use a pretty hostname slug in the address bar
// (`/sites/example.com`) instead of the raw encoded-origin siteId.

/** The address-bar slug for a site URL — just its hostname. */
export function siteSlug(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}
