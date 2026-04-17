import type { ScanMeta, UnlighthouseRouteReport } from 'unlighthouse'
import { apiUrl, websocketUrl } from './unlighthouse'

// Core state
export const unlighthouseReports = ref<UnlighthouseRouteReport[]>([])
export const scanMeta = ref<ScanMeta | null>(null)
export const isOffline = ref(false)

// Modal state
export const lighthouseReportModalOpen = ref(false)
export const iframeModalUrl = ref('')
export const isDebugModalOpen = ref(false)

// WebSocket connection
let ws: WebSocket | null = null
let reconnectAttempts = 0
const maxReconnectAttempts = 5

export function wsConnect(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws?.readyState === WebSocket.OPEN) {
      resolve()
      return
    }

    const url = websocketUrl.value
    if (!url) {
      reject(new Error('No WebSocket URL configured'))
      return
    }

    ws = new WebSocket(url)

    ws.onopen = () => {
      reconnectAttempts = 0
      isOffline.value = false
      resolve()
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.event === 'route-report') {
        const report = data.payload as UnlighthouseRouteReport
        const idx = unlighthouseReports.value.findIndex(r => r.route.path === report.route.path)
        if (idx >= 0) {
          unlighthouseReports.value[idx] = report
        }
        else {
          unlighthouseReports.value.push(report)
        }
      }
      else if (data.event === 'scan-meta') {
        scanMeta.value = data.payload
      }
    }

    ws.onclose = () => {
      isOffline.value = true
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++
        setTimeout(wsConnect, 1000 * reconnectAttempts)
      }
    }

    ws.onerror = () => {
      isOffline.value = true
      reject(new Error('WebSocket connection failed'))
    }
  })
}

export function wsDisconnect() {
  if (ws) {
    ws.close()
    ws = null
  }
}

// Fetch scan metadata
export async function refreshScanMeta() {
  if (!apiUrl.value)
    return
  const data = await $fetch<ScanMeta>(`${apiUrl.value}/scan-meta`).catch(() => null)
  if (data)
    scanMeta.value = data
}

// Open Lighthouse report modal
export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport | any) {
  if (!report?.artifactUrl && !report?.route?.path)
    return

  // Build URL for the report
  let reportUrl = report.artifactUrl
  if (!reportUrl && apiUrl.value) {
    const path = encodeURIComponent(report.route?.path || '/')
    reportUrl = `${apiUrl.value}/reports/${path}/lighthouse.html`
  }

  if (reportUrl) {
    iframeModalUrl.value = reportUrl
    lighthouseReportModalOpen.value = true
  }
}

export function closeLighthouseReportModal() {
  lighthouseReportModalOpen.value = false
  iframeModalUrl.value = ''
}

export function openDebugModal() {
  isDebugModalOpen.value = true
}
