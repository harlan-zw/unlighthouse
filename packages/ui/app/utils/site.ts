// Site URL -> slug helper. We use a pretty host slug in the address bar
// (`/sites/example.com`) instead of the raw encoded-origin siteId. Keeping a
// non-default port is important: localhost:3000 and localhost:4000 are
// distinct scan origins and must not navigate to the same site page.

/** The address-bar slug for a site URL — hostname plus non-default port. */
export function siteSlug(url: string): string {
  try {
    return new URL(url).host
  }
  catch (_err) {
    // Non-URL site labels are already slug-safe enough for legacy routes.
    return url
  }
}
