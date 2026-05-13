import { asScanId, useApiClient } from './useApiClient'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

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

function freshState(): ScanState {
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

async function getCurrentScanIdLocal(): Promise<string | null> {
  const client = useApiClient()
  const res = await client['scan.current']({}).catch(() => null)
  return res?.scanId ?? null
}

export function useScan() {
  const { isStatic } = useUnlighthouseConfig()
  const nuxtApp = useNuxtApp()
  const transport = nuxtApp.$transport as { connect: () => Promise<void>, disconnect: () => void }
  const client = useApiClient()
  // TODO(v2): wire scanId from route or shared state; backend tolerates empty scanId for status
  const scanId = useState<string>('scanId', () => '')

  const state = reactive<ScanState>(freshState())

  const isScanning = computed(() => activeScanStatuses.includes(state.status))
  const isScanComplete = computed(() => state.status === 'complete')
  const scanProgressPercent = computed(() => state.progress.percent)

  async function fetchScanStatus() {
    if (isStatic.value)
      return
    const data = await client['scan.status']({ scanId: asScanId(scanId.value ?? '') }).catch(() => null)
    if (data)
      Object.assign(state, data)
  }

  async function cancelScan() {
    if (isStatic.value)
      return
    const result = await client['scan.cancel']({ scanId: asScanId(scanId.value ?? '') }).catch(() => null)
    if (result)
      state.status = 'cancelled'
  }

  async function pauseScan() {
    if (isStatic.value)
      return
    const result = await client['scan.pause']({ scanId: asScanId(scanId.value ?? '') }).catch(() => null)
    if (result)
      state.paused = true
  }

  async function resumeScan() {
    if (isStatic.value)
      return
    const result = await client['scan.resume']({ scanId: asScanId(scanId.value ?? '') }).catch(() => null)
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
    const result = await client['scan.rescanAll']({ scanId: asScanId(currentId) }).catch((err: unknown) => {
      state.status = 'error'
      state.error = err instanceof Error ? err.message : 'Failed to retry scan'
      return null
    })

    if (result?.scanId)
      await navigateTo(`/results/${result.scanId}/scan`, { replace: true })
  }

  function onProgress(data: Partial<ScanProgress>) {
    state.progress = { ...state.progress, ...data }
    if (state.progress.percent < 100)
      state.status = 'scanning'
  }

  function onRouteComplete(data: CompletedRoute) {
    state.recentlyCompleted = [data, ...state.recentlyCompleted.slice(0, 9)]
  }

  function onComplete() {
    state.status = 'complete'
    state.progress.percent = 100
    state.paused = false
    state.error = null
  }

  function onCancelled() {
    state.status = 'cancelled'
    state.paused = false
    state.error = null
  }

  function onError(data: { message?: string }) {
    state.status = 'error'
    state.paused = false
    state.error = data?.message || 'Unknown error'
  }

  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    if (isStatic.value)
      return

    nuxtApp.hook('transport:scan:progress', onProgress)
    nuxtApp.hook('transport:scan:route-complete', onRouteComplete)
    nuxtApp.hook('transport:scan:complete', onComplete)
    nuxtApp.hook('transport:scan:cancelled', onCancelled)
    nuxtApp.hook('transport:scan:error', onError)

    fetchScanStatus()
    transport.connect().catch(() => {})
    pollInterval = setInterval(fetchScanStatus, 2000)
  })

  onUnmounted(() => {
    if (pollInterval)
      clearInterval(pollInterval)
  })

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
