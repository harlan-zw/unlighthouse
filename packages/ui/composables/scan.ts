import type { CompletedRoute, ScanProgress } from '@unlighthouse/contracts'
import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import type { Ref } from 'vue'
import { useApiClient } from './useApiClient'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

export type ScanStatus = 'idle' | 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'

export const activeScanStatuses: ScanStatus[] = ['starting', 'discovering', 'scanning']

export interface ScanState {
  status: ScanStatus
  paused: boolean
  site: string | null
  progress: ScanProgress
  currentUrl: string | null
  recentlyCompleted: CompletedRoute[]
  startedAt: string | null
  estimatedTimeRemaining: number | null
  workers: number
  error: string | null
}

export function freshScanState(): ScanState {
  return {
    status: 'idle',
    paused: false,
    site: null,
    progress: { discovered: 0, scanned: 0, failed: 0, total: 0, percent: 0 },
    currentUrl: null,
    recentlyCompleted: [],
    startedAt: null,
    estimatedTimeRemaining: null,
    workers: 0,
    error: null,
  }
}

export function isActiveScanStatus(status: string | null | undefined, paused = false) {
  return paused || activeScanStatuses.includes((status || 'idle') as ScanStatus)
}

// Singleton wired by `plugins/scan.client.ts`. Owns the reactive state +
// `scanId` for the whole app — transport listeners and status polling live
// in the plugin so they don't compound on each `useScan()` call.
export interface ScanSingleton {
  state: ScanState
  scanId: Ref<string>
}

declare module '#app' {
  interface NuxtApp {
    $scan: ScanSingleton
  }
}

export function useScan() {
  const { state, scanId } = useNuxtApp().$scan
  const { isStatic } = useUnlighthouseConfig()
  const client = useApiClient()

  const isScanning = computed(() => activeScanStatuses.includes(state.status))
  const isScanComplete = computed(() => state.status === 'complete')
  const scanProgressPercent = computed(() => state.progress.percent)

  async function cancelScan() {
    if (isStatic.value)
      return
    const result = await client['scan.cancel']({ scanId: (scanId.value ?? '') as ScanId }).catch(() => null)
    if (result)
      state.status = 'cancelled'
  }

  async function pauseScan() {
    if (isStatic.value)
      return
    const result = await client['scan.pause']({ scanId: (scanId.value ?? '') as ScanId }).catch(() => null)
    if (result)
      state.paused = true
  }

  async function resumeScan() {
    if (isStatic.value)
      return
    const result = await client['scan.resume']({ scanId: (scanId.value ?? '') as ScanId }).catch(() => null)
    if (result)
      state.paused = false
  }

  async function retryScan() {
    if (isStatic.value || !state.site)
      return

    state.status = 'starting'
    state.error = null
    state.progress = { discovered: 0, scanned: 0, failed: 0, total: 0, percent: 0 }
    state.recentlyCompleted = []

    const currentId = scanId.value || (await client['scan.current']({}).catch(() => null))?.scanId
    if (!currentId) {
      state.status = 'error'
      state.error = 'No scan to retry'
      return
    }
    const result = await client['scan.rescanAll']({ scanId: currentId as ScanId }).catch((err: unknown) => {
      state.status = 'error'
      state.error = err instanceof Error ? err.message : 'Failed to retry scan'
      return null
    })

    if (result?.scanId)
      await navigateTo(`/results/${result.scanId}/scan`, { replace: true })
  }

  return {
    scanState: state,
    isScanning,
    isScanComplete,
    scanProgressPercent,
    cancelScan,
    pauseScan,
    resumeScan,
    retryScan,
  }
}
