import type { ScanId } from '@unlighthouse/contracts'

// Non-reactive variant for the common case where the page reads the
// id once at setup and never expects it to change (most scan
// subpages). Saves the `.value` ceremony.
export function getScanId(): ScanId {
  const route = useRoute()
  return ((route.params.scanId ?? route.params.id) as string) as ScanId
}

/**
 * Resolve a route's screenshot URL. In a static (offline) report the build
 * exports screenshots to `assets/screenshots/*` and embeds a `path → url` map in
 * the payload (#275); use that so thumbnails resolve without the dead API. Live
 * mode falls back to the `/dashboard/screenshot` endpoint.
 */
export function useScreenshotUrl() {
  const baseUrl = useRuntimeConfig().public.unlighthouseApiUrl as string
  return (scanId: string, path: string, device?: string): string => {
    if (import.meta.client) {
      const map = (window as unknown as { __unlighthouse_payload?: { screenshots?: Record<string, string> } })
        .__unlighthouse_payload
        ?.screenshots
      if (map && map[path])
        return map[path]
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
// `scanId` is brand-cast to `ScanId` here: the param is always a non-empty
// string when a scan route matched, and every command input types it as the
// branded `ScanId`. Doing it once keeps api calls cast-free at the call sites.
export function useScanBase() {
  const route = useRoute()
  const siteId = computed(() => route.params.siteId as string)
  const scanId = computed(() => route.params.scanId as string as ScanId)
  const scanBase = computed(() => `/sites/${siteId.value}/scans/${scanId.value}`)
  return { siteId, scanId, scanBase }
}
