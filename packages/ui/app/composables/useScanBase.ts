import type { ScanId } from '@unlighthouse/contracts'

// Path helpers for the nested scan tree: /sites/{siteId}/scans/{scanId}/*.
// Reads the slug + scanId straight off the route params so any component
// inside the scan layout can build correct in-tree links without threading
// props. `scanBase` is the common prefix for sub-pages.
//
// `scanId` is brand-cast to `ScanId` here (the same safe cast `useScanId`
// makes): the param is always a non-empty string when a scan route matched,
// and every command input types it as the branded `ScanId`. Doing it once
// in the composable keeps the api calls cast-free at the call sites.
export function useScanBase() {
  const route = useRoute()
  const siteId = computed(() => route.params.siteId as string)
  const scanId = computed(() => route.params.scanId as string as ScanId)
  const scanBase = computed(() => `/sites/${siteId.value}/scans/${scanId.value}`)
  return { siteId, scanId, scanBase }
}
