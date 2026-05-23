// Fetches the scan immediately preceding `scanId` for the same site so the
// results page can surface per-route regression status. We resolve by:
//   1. history.get the current scan (to know its site + startedAt)
//   2. history.list that site (sorted desc) and take the first scan whose
//      startedAt < current.startedAt
//   3. history.get that previous scan to pull its routes (= per-(url,device)
//      score atoms)
//
// All requests are .catch'd to null — a missing previous scan just disables
// the regression filter, never breaks the page.

import type { ScanId, ScanRoute } from '@unlighthouse/contracts'
import { useApiClient } from './useApiClient'

export interface PreviousScanResult {
  scanId: string
  routes: ScanRoute[]
}

export function usePreviousScan(scanId: MaybeRef<string | undefined>) {
  const apiClient = useApiClient()
  const id = computed(() => unref(scanId))

  return useAsyncData<PreviousScanResult | null>(
    () => `prev-scan:${id.value ?? ''}`,
    async () => {
      if (!id.value)
        return null
      const current = await apiClient['history.get']({ scanId: id.value as ScanId }).catch(() => null)
      if (!current)
        return null
      const list = await apiClient['history.list']({
        site: current.site,
        page: 1,
        pageSize: 50,
      }).catch(() => null)
      if (!list?.items?.length)
        return null
      // history.list isn't documented as sorted, so sort defensively. Most
      // recent first, then find the first scan strictly older than ours.
      const sorted = [...list.items].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const prev = sorted.find(s => s.scanId !== current.scanId && s.startedAt < current.startedAt)
      if (!prev)
        return null
      const full = await apiClient['history.get']({ scanId: prev.scanId }).catch(() => null)
      if (!full)
        return null
      return { scanId: String(prev.scanId), routes: full.routes ?? [] }
    },
    { watch: [id], default: () => null },
  )
}
