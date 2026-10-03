import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'

interface SiteSwitchRoute {
  path: string
  query?: LocationQueryRaw
  hash?: string
}

/** Scan and route IDs belong to one site. Only carry the section across sites. */
export function siteSwitchDestination(route: SiteSwitchRoute, slug: string, latestScanId?: string): RouteLocationRaw {
  const base = `/sites/${encodeURIComponent(slug)}`
  const scanSection = route.path.match(/^\/sites\/[^/]+\/scans\/[^/]+(?:\/(.*))?$/)
  if (scanSection) {
    if (!latestScanId)
      return { path: base }
    const section = scanSection[1] || 'routes'
    const preservedSection = section === 'overview' || section === 'routes' || /^packs\/[^/]+$/.test(section)
      ? section
      : 'routes'
    return { path: `${base}/scans/${encodeURIComponent(latestScanId)}/${preservedSection}` }
  }
  if (/^\/sites\/[^/]+\/compare$/.test(route.path))
    return { path: `${base}/compare` }
  if (/^\/sites\/[^/]+\/?$/.test(route.path))
    return { path: base, query: route.query, hash: route.hash }
  return { path: base }
}
