import type { NormalisedRoute, ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/core'
import { sum } from 'lodash-es'
import { apiUrl, categories, isStatic, resolveArtifactPath, wsUrl } from './unlighthouse'

// Shared reactive state
export const wsReports = reactive(new Map<string, UnlighthouseRouteReport>())
export const activeTab = ref(0)
export const lastScanMeta = ref<ScanMeta | null>(null)

// Modal state
export const isDebugModalOpen = ref(false)
export const lighthouseReportModalOpen = ref(false)
export const contentModalOpen = ref(false)
export const iframeModalUrl = ref<string | null>(null)
export const thumbnailsModalOpen = ref(false)
export const activeScreenshots = ref<any[]>([])

// Computed values
export const unlighthouseReports = computed<UnlighthouseRouteReport[]>(() => {
  if (isStatic.value) {
    return window.__unlighthouse_payload?.reports || []
  }
  return Array.from(wsReports.values())
})

export const scanMeta = computed<ScanMeta | null>(() => {
  if (isStatic.value) return window.__unlighthouse_payload?.scanMeta || null
  return lastScanMeta.value
})

export const isOffline = computed(() => {
  if (isStatic.value) return false
  return !!(wsReports.size === 0 && lastScanMeta.value)
})

export const shouldShowWaitingState = computed(() => {
  if (isStatic.value) return !window.__unlighthouse_payload?.reports?.length
  return wsReports.size === 0 || isOffline.value
})

export const isModalOpen = computed(() =>
  isDebugModalOpen.value || lighthouseReportModalOpen.value || contentModalOpen.value || thumbnailsModalOpen.value,
)

export const categoryScores = computed(() => {
  const reports = unlighthouseReports.value || []
  const reportsFinished = reports.filter(r => !!r.report)
  const cats = categories.value

  if (reportsFinished.length === 0) {
    return cats.map(() => 0)
  }

  return cats.map((_c: string, i: number) => {
    const reportsWithGoodScore = reportsFinished.filter(r => !!r.report?.categories?.[i]?.score)
    if (reportsWithGoodScore.length === 0) return 0
    return sum(reportsWithGoodScore.map(r => r.report?.categories?.[i]?.score || 0)) / reportsWithGoodScore.length
  })
})

// Actions
export function openDebugModal() {
  isDebugModalOpen.value = true
}

export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport, tab?: string) {
  const path = resolveArtifactPath(report, '/lighthouse.html')
  iframeModalUrl.value = `${path}${tab ? `#${tab}` : ''}`
  lighthouseReportModalOpen.value = true
}

export function openContentModal() {
  contentModalOpen.value = true
}

export function openThumbnailsModal(screenshots: any[]) {
  activeScreenshots.value = screenshots
  thumbnailsModalOpen.value = true
}

export function closeThumbnailsModal() {
  thumbnailsModalOpen.value = false
  activeScreenshots.value = []
}

export function closeAllModals() {
  isDebugModalOpen.value = false
  lighthouseReportModalOpen.value = false
  contentModalOpen.value = false
  thumbnailsModalOpen.value = false
  iframeModalUrl.value = null
  activeScreenshots.value = []
}

export async function wsConnect() {
  if (isStatic.value || !wsUrl.value) return

  const ws = new WebSocket(wsUrl.value)
  ws.onmessage = (message) => {
    try {
      const { response } = JSON.parse(message.data)
      if (response?.route?.path) {
        wsReports.set(response.route.path, response)
      }
    }
    catch {}
  }
  ws.onerror = (error) => console.warn('WebSocket error:', error)
  ws.onclose = () => console.warn('WebSocket closed')

  // Fetch initial reports
  $fetch<UnlighthouseRouteReport[]>(`${apiUrl.value}/reports`)
    .then((reports) => {
      reports?.forEach((report) => {
        if (report?.route?.path) wsReports.set(report.route.path, report)
      })
    })
    .catch((err) => console.warn('Failed to fetch reports:', err))
}

export function refreshScanMeta() {
  if (isStatic.value) return

  $fetch<ScanMeta>(`${apiUrl.value}/scan-meta`)
    .then((data) => {
      if (data) lastScanMeta.value = data
    })
    .catch((err) => console.warn('Failed to refresh scan meta:', err))
}

export function rescanRoute(route: NormalisedRoute) {
  return $fetch(`${apiUrl.value}/reports/${route.id}/rescan`, { method: 'POST' })
}
