import type { ScanId } from '@unlighthouse/contracts'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'

export function routeParamString(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value || undefined
  if (Array.isArray(value)) {
    const first = value.find(item => typeof item === 'string' && item.length > 0)
    return typeof first === 'string' ? first : undefined
  }
  return undefined
}

export function optionalScanId(value: unknown): ScanId | undefined {
  const raw = routeParamString(value)
  return raw ? parseScanId(raw) : undefined
}

export function requireScanId(value: unknown): ScanId {
  const scanId = optionalScanId(value)
  if (!scanId)
    throw new TypeError('Expected a non-empty scan id in the current route.')
  return scanId
}

// Non-reactive variant for the common case where the page reads the
// id once at setup and never expects it to change (most scan
// subpages). Saves the `.value` ceremony.
export function getScanId(): ScanId {
  const route = useRoute()
  return requireScanId(route.params.scanId ?? route.params.id)
}

/**
 * Resolve a route's screenshot URL. In a static (offline) report the build
 * exports screenshots to `assets/screenshots/*` and embeds a
 * `scan → path → device → url` map in the payload (#275); use that so
 * thumbnails resolve without the dead API. Live mode falls back to the
 * `/dashboard/screenshot` endpoint.
 */
export function createScreenshotUrl() {
  const baseUrl = getRuntimeApiUrl()
  return (scanId: string, path: string, device?: string): string => {
    if (import.meta.client) {
      const screenshots = window.__unlighthouse_payload?.screenshots?.[scanId]?.[path]
      const staticUrl = device
        ? screenshots?.[device as 'mobile' | 'desktop']
        : screenshots?.desktop ?? screenshots?.mobile
      if (staticUrl)
        return staticUrl
    }
    // `device` selects which form factor's capture to serve in a multi-device
    // scan (otherwise the endpoint returns the first capture for the path).
    const q = device ? `?device=${device}` : ''
    return `${baseUrl}/dashboard/screenshot/${scanId}/${encodeURIComponent(path)}${q}`
  }
}

// Path helpers for the nested scan tree: /sites/{siteId}/scans/{scanId}/*.
// Reads the slug + scanId straight off the route params so any component
// inside the scan layout can build correct in-tree links without threading
// props. `scanBase` is the common prefix for sub-pages.
//
// Parse the route boundary once so command callers only see branded ids.
export function useScanBase() {
  const route = useRoute()
  const siteId = computed(() => routeParamString(route.params.siteId) ?? '')
  const scanId = computed(() => requireScanId(route.params.scanId))
  const scanBase = computed(() => `/sites/${siteId.value}/scans/${scanId.value}`)
  return { siteId, scanId, scanBase }
}
