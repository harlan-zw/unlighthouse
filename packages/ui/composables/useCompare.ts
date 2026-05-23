// Compare two scans via `compare.run` and `compare.markdown`. The handler shape
// is documented in packages/core/src/api/handlers/compare.ts; we don't
// re-validate here, the contract is the source of truth.

import type { CompareReport, ScanId } from '@unlighthouse/contracts'
import { useApiClient } from './useApiClient'

export function useCompare(
  baseScanId: MaybeRef<string | undefined>,
  currentScanId: MaybeRef<string | undefined>,
) {
  const client = useApiClient()
  const base = computed(() => unref(baseScanId))
  const current = computed(() => unref(currentScanId))

  const ready = computed(() => !!base.value && !!current.value && base.value !== current.value)

  const { data, pending, error, refresh } = useAsyncData<CompareReport | null>(
    () => `compare:${base.value ?? ''}:${current.value ?? ''}`,
    async () => {
      if (!ready.value)
        return null
      return await client['compare.run']({
        baseScanId: base.value as ScanId,
        currentScanId: current.value as ScanId,
      })
    },
    { watch: [base, current], default: () => null },
  )

  async function fetchMarkdown(title?: string) {
    if (!ready.value)
      return null
    return await client['compare.markdown']({
      baseScanId: base.value as ScanId,
      currentScanId: current.value as ScanId,
      title,
    })
  }

  return { report: data, pending, error, refresh, ready, fetchMarkdown }
}
