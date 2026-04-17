import { apiUrl, isStatic, websocketUrl } from './unlighthouse'

export type ScanStatus = 'idle' | 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'

export const activeScanStatuses: ScanStatus[] = ['starting', 'discovering', 'scanning']

export interface ScanProgress {
  discovered: number
  scanned: number
  failed: number
  total: number
  percent: number
}

export interface CompletedRoute {
  path: string
  score: number
  categories?: Record<string, { score: number, title: string }>
}

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

export const scanState = reactive<ScanState>({
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
})

let scanWs: WebSocket | null = null

export const isScanning = computed(() =>
  activeScanStatuses.includes(scanState.status),
)

export const isScanComplete = computed(() => scanState.status === 'complete')

export const scanProgressPercent = computed(() => scanState.progress.percent)

export function isActiveScanStatus(status: string | null | undefined, paused = false) {
  return paused || activeScanStatuses.includes((status || 'idle') as ScanStatus)
}

export function formatTimeRemaining(ms: number | null): string {
  if (!ms || ms <= 0)
    return '--'

  const seconds = Math.floor(ms / 1000)
  if (seconds < 60)
    return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export async function fetchScanStatus() {
  if (isStatic.value)
    return

  const data = await $fetch<ScanState>(`${apiUrl.value}/scan/status`).catch(() => null)
  if (data)
    Object.assign(scanState, data)
}

export async function cancelScan() {
  if (isStatic.value)
    return

  const result = await $fetch<{ success: boolean }>(`${apiUrl.value}/scan/cancel`, {
    method: 'POST',
  }).catch(() => null)

  if (result?.success)
    scanState.status = 'cancelled'
}

export async function pauseScan() {
  if (isStatic.value)
    return

  const result = await $fetch<{ success: boolean, paused: boolean }>(`${apiUrl.value}/scan/pause`, {
    method: 'POST',
  }).catch(() => null)

  if (result?.success)
    scanState.paused = true
}

export async function resumeScan() {
  if (isStatic.value)
    return

  const result = await $fetch<{ success: boolean, paused: boolean }>(`${apiUrl.value}/scan/resume`, {
    method: 'POST',
  }).catch(() => null)

  if (result?.success)
    scanState.paused = false
}

export async function retryScan() {
  if (isStatic.value || !scanState.site)
    return

  scanState.status = 'starting'
  scanState.error = null
  scanState.progress = { discovered: 0, scanned: 0, failed: 0, total: 0, percent: 0 }
  scanState.recentlyCompleted = []

  const result = await $fetch<{ scanId?: string }>(`${apiUrl.value}/reports/rescan`, {
    method: 'POST',
  }).catch((err) => {
    scanState.status = 'error'
    scanState.error = err?.message || 'Failed to retry scan'
    return null
  })

  if (result?.scanId)
    await navigateTo(`/results/${result.scanId}/scan`, { replace: true })
}

export function connectScanWebSocket() {
  if (isStatic.value || !websocketUrl.value || scanWs)
    return

  scanWs = new WebSocket(websocketUrl.value)

  scanWs.onmessage = (message) => {
    const parsed = JSON.parse(message.data)

    if (parsed.event === 'scan:progress') {
      scanState.progress = {
        ...scanState.progress,
        ...parsed.data,
      }

      if (scanState.progress.percent < 100)
        scanState.status = 'scanning'
    }
    else if (parsed.event === 'scan:route-complete') {
      scanState.recentlyCompleted = [
        parsed.data,
        ...scanState.recentlyCompleted.slice(0, 9),
      ]
    }
    else if (parsed.event === 'scan:complete') {
      scanState.status = 'complete'
      scanState.progress.percent = 100
      scanState.paused = false
      scanState.error = null
    }
    else if (parsed.event === 'scan:cancelled') {
      scanState.status = 'cancelled'
      scanState.paused = false
      scanState.error = null
    }
    else if (parsed.event === 'scan:error') {
      scanState.status = 'error'
      scanState.paused = false
      scanState.error = parsed.data?.message || 'Unknown error'
    }
  }

  scanWs.onerror = () => {
    console.warn('Scan WebSocket error')
  }

  scanWs.onclose = () => {
    scanWs = null
  }
}

export function disconnectScanWebSocket() {
  if (scanWs) {
    scanWs.close()
    scanWs = null
  }
}

export function useScan() {
  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    if (isStatic.value)
      return

    fetchScanStatus()
    connectScanWebSocket()
    pollInterval = setInterval(fetchScanStatus, 2000)
  })

  onUnmounted(() => {
    if (pollInterval)
      clearInterval(pollInterval)
    disconnectScanWebSocket()
  })

  return {
    scanState,
    isScanning,
    isScanComplete,
    scanProgressPercent,
    cancelScan,
    pauseScan,
    resumeScan,
    retryScan,
    formatTimeRemaining,
  }
}
