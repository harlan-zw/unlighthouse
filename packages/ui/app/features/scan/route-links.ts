type RouteDevice = 'mobile' | 'desktop'

export interface AuditedRouteLinkRow {
  url: string
  path: string
  device: string
}

export function scanRouteLink(scanBase: string, path: string, device?: string, recordedUrl?: string): string {
  const query = new URLSearchParams()
  if (device === 'mobile' || device === 'desktop')
    query.set('device', device)
  if (recordedUrl)
    query.set('url', recordedUrl)
  const suffix = query.size ? `?${query}` : ''
  return `${scanBase}/route/${encodeURIComponent(path)}${suffix}`
}

export function parseRecordedRouteUrl(path: string, value: unknown, site?: string): string | undefined {
  if (typeof value !== 'string' || !site)
    return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return undefined
    if (url.origin !== new URL(site).origin)
      return undefined
    // This is the persisted normaliseRoute order, including SPA hash routes.
    const normalized = `${url.pathname}${url.hash.startsWith('#/') ? url.hash : ''}${url.search}`
    // Audit workers also persist pathname-only rows. Both conventions retain
    // the exact recorded URL, including its query, after site/path agreement.
    return normalized === path || url.pathname === path ? value : undefined
  }
  catch {
    // Invalid optional URL query has no navigation authority. Fall back to
    // the required path and scan origin, rather than trusting its contents.
    return undefined
  }
}

// Vue Router has already decoded the route parameter. Decoding a second time
// changes persisted %2F sequences and throws for literal percent characters.
export function routeDetailPath(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join('/') : value ?? ''
}

export function resolveAffectedRouteLink(
  scanBase: string | undefined,
  affected: string,
  rows: readonly AuditedRouteLinkRow[],
  device?: RouteDevice,
): string | undefined {
  if (!scanBase)
    return undefined
  const matches = rows.filter(row => (row.url === affected || row.path === affected) && (!device || row.device === device))
  const first = matches[0]
  if (!first)
    return undefined
  // Different paths for one affected value cannot be safely inferred.
  if (matches.some(row => row.path !== first.path || row.url !== first.url))
    return undefined
  const devices = new Set(matches.map(row => row.device))
  return scanRouteLink(scanBase, first.path, device ?? (devices.size === 1 ? first.device : undefined), first.url)
}
