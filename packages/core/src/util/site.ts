// Domain-level site identity. A "site" groups every scan of the same origin
// (scheme + host + port), regardless of the exact path scanned. The id is the
// encoded origin so it's a stable, URL-safe primary key; `url` stored on the
// record is the bare origin (for display/links), and `name` is the host[:port].

export function siteOrigin(url: string): string {
  return new URL(url).origin
}

export function deriveSiteId(url: string): string {
  return encodeURIComponent(siteOrigin(url))
}

export function deriveSiteName(url: string): string {
  const u = new URL(url)
  return u.port ? `${u.hostname}:${u.port}` : u.hostname
}
