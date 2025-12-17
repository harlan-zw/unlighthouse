import { apiUrl, isStatic, wsUrl } from './unlighthouse'

export type ScanStatus = 'idle' | 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'

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
  site: string | null
  progress: ScanProgress
  currentUrl: string | null
  recentlyCompleted: CompletedRoute[]
  startedAt: string | null
  estimatedTimeRemaining: number | null
  workers: number
  error: string | null
}

// Reactive scan state
export const scanState = reactive<ScanState>({
  status: 'idle',
  site: null,
  progress: { discovered: 0, scanned: 0, failed: 0, total: 0, percent: 0 },
  currentUrl: null,
  recentlyCompleted: [],
  startedAt: null,
  estimatedTimeRemaining: null,
  workers: 0,
  error: null,
})

// WebSocket connection for scan events
let scanWs: WebSocket | null = null

export const isScanning = computed(() =>
  ['starting', 'discovering', 'scanning'].includes(scanState.status),
)

export const isScanComplete = computed(() => scanState.status === 'complete')

export const scanProgressPercent = computed(() => scanState.progress.percent)

export function formatTimeRemaining(ms: number | null): string {
  if (!ms || ms <= 0) return '--'
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}m ${remainingSeconds}s`
}

export async function fetchScanStatus() {
  if (isStatic.value) return

  const data = await $fetch<ScanState>(`${apiUrl.value}/scan/status`).catch(() => null)
  if (data) {
    Object.assign(scanState, data)
  }
}

export async function cancelScan() {
  if (isStatic.value) return

  const result = await $fetch<{ success: boolean }>(`${apiUrl.value}/scan/cancel`, {
    method: 'POST',
  }).catch(() => null)

  if (result?.success) {
    scanState.status = 'cancelled'
  }
}

export function connectScanWebSocket() {
  if (isStatic.value || !wsUrl.value || scanWs) return

  scanWs = new WebSocket(wsUrl.value)

  scanWs.onmessage = (message) => {
    const parsed = JSON.parse(message.data)

    // Handle new event format
    if (parsed.event === 'scan:progress') {
      scanState.progress = { ...scanState.progress, ...parsed.data }
      if (scanState.progress.percent < 100) {
        scanState.status = 'scanning'
      }
    }
    else if (parsed.event === 'scan:route-complete') {
      // Add to front of recently completed, keep max 10
      scanState.recentlyCompleted = [
        parsed.data,
        ...scanState.recentlyCompleted.slice(0, 9),
      ]
    }
    else if (parsed.event === 'scan:complete') {
      scanState.status = 'complete'
      scanState.progress.percent = 100
    }
    else if (parsed.event === 'scan:error') {
      scanState.status = 'error'
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

// Composable for use in components
export function useScan() {
  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    if (isStatic.value) return

    // Initial fetch
    fetchScanStatus()

    // Connect WebSocket
    connectScanWebSocket()

    // Poll for status updates every 2 seconds as backup
    pollInterval = setInterval(fetchScanStatus, 2000)
  })

  onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval)
    disconnectScanWebSocket()
  })

  return {
    scanState,
    isScanning,
    isScanComplete,
    scanProgressPercent,
    cancelScan,
    formatTimeRemaining,
  }
}
