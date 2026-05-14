// Reactive wrapper around `scan.summary` — the layered agent-output tier 1
// (D-028). Returns the sub-1KB JSON the built-in `overview` pack produces:
// counts, score distribution, worst routes, template groups.
//
// Used by the results overview page to render an opinionated summary
// alongside the per-route table. Auto-refetches when scanId changes.

import type { CommandOutput, ScanSummaryCmd } from '@unlighthouse/contracts'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, toValue, watchEffect } from 'vue'
import { useApiClient } from '~/composables/useApiClient'

export type ScanSummary = CommandOutput<typeof ScanSummaryCmd>

export function useScanSummary(scanId: MaybeRefOrGetter<string | null | undefined>): {
  data: Ref<ScanSummary | null>
  pending: Ref<boolean>
  error: Ref<Error | null>
  refresh: () => Promise<void>
} {
  const api = useApiClient()
  const data = ref<ScanSummary | null>(null)
  const pending = ref(false)
  const error = ref<Error | null>(null)
  const id = computed(() => toValue(scanId))

  async function refresh() {
    const value = id.value
    if (!value) {
      data.value = null
      return
    }
    pending.value = true
    error.value = null
    try {
      data.value = await api['scan.summary']({ scanId: value as never })
    }
    catch (err) {
      error.value = err as Error
      data.value = null
    }
    finally {
      pending.value = false
    }
  }

  watchEffect(() => {
    void refresh()
  })

  return { data, pending, error, refresh }
}
