// Path helpers for the nested scan tree: /sites/{siteId}/scans/{scanId}/*.
// Reads the slug + scanId straight off the route params so any component
// inside the scan layout can build correct in-tree links without threading
// props. `scanBase` is the common prefix for sub-pages.
export function useScanBase() {
  const route = useRoute()
  const siteId = computed(() => route.params.siteId as string)
  const scanId = computed(() => route.params.scanId as string)
  const scanBase = computed(() => `/sites/${siteId.value}/scans/${scanId.value}`)
  return { siteId, scanId, scanBase }
}
