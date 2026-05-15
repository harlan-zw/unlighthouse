// Reactive wrapper around `pack.run`. Each call runs the pack against the
// current scanId; results are cached in-component until refresh() is called
// or scanId changes.
//
// Typed via the generic Pack name — callers infer the report shape from the
// pack's reportSchema. This composable returns `report` as `unknown`; pages
// narrow it themselves (TS doesn't know which pack you asked for at compile
// time).

import type { CommandOutput, PackRunCmd } from '@unlighthouse/contracts'
import type { MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, toValue, watchEffect } from 'vue'
import { useApiClient } from '~/composables/useApiClient'

export type PackRunResult = CommandOutput<typeof PackRunCmd>

export function usePackRun(
  scanId: MaybeRefOrGetter<string | null | undefined>,
  pack: MaybeRefOrGetter<string>,
): {
    data: Ref<PackRunResult | null>
    pending: Ref<boolean>
    error: Ref<Error | null>
    /**
     * Re-fetch. Pass `{ force: true }` to bypass the server-side pack cache
     * — useful for a manual "rerun" button after a pack update. The default
     * (no args) lets the server serve from `packRuns` if the entry exists.
     */
    refresh: (opts?: { force?: boolean }) => Promise<void>
  } {
  const api = useApiClient()
  const data = ref<PackRunResult | null>(null)
  const pending = ref(false)
  const error = ref<Error | null>(null)
  const id = computed(() => toValue(scanId))
  const packName = computed(() => toValue(pack))

  async function refresh(opts: { force?: boolean } = {}) {
    const value = id.value
    const name = packName.value
    if (!value || !name) {
      data.value = null
      return
    }
    pending.value = true
    error.value = null
    try {
      data.value = await api['pack.run']({
        scanId: value as never,
        pack: name,
        ...(opts.force ? { refresh: true } : {}),
      })
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
