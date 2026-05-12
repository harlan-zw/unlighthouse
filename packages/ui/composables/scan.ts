import { unlighthouseReports } from './state'
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

export async function rescanSite() {
  const { apiUrl } = useUnlighthouseConfig()
  if (!apiUrl.value)
    return
  unlighthouseReports.value = []
  const result = await $fetch<{ scanId?: string }>(`${apiUrl.value}/reports/rescan`, { method: 'POST' }).catch((err) => {
    if (err?.data?.scanId)
      navigateTo(`/results/${err.data.scanId}/scan`)
    console.warn(err)
    return null
  })
  if (result?.scanId)
    await navigateTo(`/results/${result.scanId}/scan`)
}

export async function rescanRoutes(paths: string[]) {
  const { apiUrl } = useUnlighthouseConfig()
  if (!apiUrl.value || !paths.length)
    return
  await $fetch(`${apiUrl.value}/rescan`, { method: 'POST', body: { paths } }).catch(console.warn)
}

export async function rescanRoute(path: string) {
  return rescanRoutes([path])
}

export function useScan() {
  const { apiUrl, isStatic } = useUnlighthouseConfig()
  const nuxtApp = useNuxtApp()
  const transport = nuxtApp.$transport as { connect: () => Promise<void>, disconnect: () => void }

  const state = reactive<ScanState>(freshState())

  const isScanning = computed(() => activeScanStatuses.includes(state.status))
  const isScanComplete = computed(() => state.status === 'complete')
  const scanProgressPercent = computed(() => state.progress.percent)

  async function fetchScanStatus() {
    if (isStatic.value)
      return
    const data = await $fetch<ScanState>(`${apiUrl.value}/scan/status`).catch(() => null)
    if (data)
      Object.assign(state, data)
  }

  async function cancelScan() {
    if (isStatic.value)
      return
    const result = await $fetch<{ success: boolean }>(`${apiUrl.value}/scan/cancel`, { method: 'POST' }).catch(() => null)
    if (result?.success)
      state.status = 'cancelled'
  }

  async function pauseScan() {
    if (isStatic.value)
      return
    const result = await $fetch<{ success: boolean }>(`${apiUrl.value}/scan/pause`, { method: 'POST' }).catch(() => null)
    if (result?.success)
      state.paused = true
  }

  async function resumeScan() {
    if (isStatic.value)
      return
    const result = await $fetch<{ success: boolean }>(`${apiUrl.value}/scan/resume`, { method: 'POST' }).catch(() => null)
    if (result?.success)
      state.paused = false
  }

  async function retryScan() {
    if (isStatic.value || !state.site)
      return

    state.status = 'starting'
    state.error = null
    state.progress = { discovered: 0, scanned: 0, failed: 0, total: 0, percent: 0 }
    state.recentlyCompleted = []

    const result = await $fetch<{ scanId?: string }>(`${apiUrl.value}/reports/rescan`, { method: 'POST' }).catch((err) => {
      state.status = 'error'
      state.error = err?.message || 'Failed to retry scan'
      return null
    })

    if (result?.scanId)
      await navigateTo(`/results/${result.scanId}/scan`, { replace: true })
  }

  function onProgress(data: ScanProgress) {
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

    nuxtApp.hook('transport:scan:progress' as any, onProgress)
    nuxtApp.hook('transport:scan:route-complete' as any, onRouteComplete)
    nuxtApp.hook('transport:scan:complete' as any, onComplete)
    nuxtApp.hook('transport:scan:cancelled' as any, onCancelled)
    nuxtApp.hook('transport:scan:error' as any, onError)

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
    rescanSite,
    rescanRoute,
    rescanRoutes,
    formatTimeRemaining,
  }
}
