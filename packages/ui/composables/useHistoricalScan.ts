import { asScanId, useApiClient } from './useApiClient'

export function useHistoricalScan(scanId: MaybeRef<string | undefined>) {
  const apiClient = useApiClient()
  const id = computed(() => unref(scanId))

  return useAsyncData(
    () => `history:${id.value ?? ''}`,
    () => id.value ? apiClient['history.get']({ scanId: asScanId(id.value) }).catch(() => null) : Promise.resolve(null),
    { watch: [id], default: () => null },
  )
}
