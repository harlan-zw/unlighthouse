import type { ScanId } from '@unlighthouse/contracts'

// The scan id from the route param is a plain string, but every
// command input types it as the branded `ScanId`. Pages were papering
// over the gap with `scanId as any` on every api call — ~8 sites, each
// one a place where a genuinely-wrong value (an url, an empty string)
// would slip past the type checker.
//
// This composable does the (safe) brand cast once, in one place, and
// hands back a typed ScanId. The route param is always a non-empty
// string when a /scan/:id route matched, so the cast is sound — and
// if the branding rules ever tighten, this is the single spot to add
// validation.
//
// Usage:
//   const scanId = useScanId()              // reactive, from route
//   api['scan.meta']({ scanId: scanId.value })
//
// Or grab the raw string when you need it for URL building:
//   const scanId = useScanId()
//   `/scan/${scanId.value}/routes`
export function useScanId() {
  const route = useRoute()
  return computed(() => (route.params.id as string) as ScanId)
}

// Non-reactive variant for the common case where the page reads the
// id once at setup and never expects it to change (most scan
// subpages). Saves the `.value` ceremony.
export function getScanId(): ScanId {
  const route = useRoute()
  return (route.params.id as string) as ScanId
}
