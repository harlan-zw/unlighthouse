import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import { useApiClient } from './useApiClient'

export function useHistoricalScan(scanId: MaybeRef<string | undefined>) {
  const apiClient = useApiClient()
  const id = computed(() => unref(scanId))

  return useAsyncData(
    () => `history:${id.value ?? ''}`,
    () => id.value ? apiClient['history.get']({ scanId: id.value as ScanId }).catch(() => null) : Promise.resolve(null),
    { watch: [id], default: () => null },
  )
}
