import type { ScanMeta, UnlighthouseRouteReport } from 'unlighthouse'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

export const unlighthouseReports = ref<UnlighthouseRouteReport[]>([])
export const scanMeta = ref<ScanMeta | null>(null)
export const isOffline = ref(false)

export const lighthouseReportModalOpen = ref(false)
export const iframeModalUrl = ref('')
export const isDebugModalOpen = ref(false)

export async function refreshScanMeta() {
  const { apiUrl } = useUnlighthouseConfig()
  if (!apiUrl.value)
    return
  const data = await $fetch<ScanMeta>(`${apiUrl.value}/scan-meta`).catch(() => null)
  if (data)
    scanMeta.value = data
}

export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport | any) {
  if (!report?.artifactUrl && !report?.route?.path)
    return

  const { apiUrl } = useUnlighthouseConfig()
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

export function useReportsStream() {
  const nuxtApp = useNuxtApp()
  const transport = nuxtApp.$transport as { connect: () => Promise<void>, disconnect: () => void }

  function onRouteReport(report: UnlighthouseRouteReport) {
    const idx = unlighthouseReports.value.findIndex(r => r.route.path === report.route.path)
    if (idx >= 0)
      unlighthouseReports.value[idx] = report
    else
      unlighthouseReports.value.push(report)
  }

  function onScanMeta(meta: ScanMeta) {
    scanMeta.value = meta
  }

  function onOpen() {
    isOffline.value = false
  }

  function onClose() {
    isOffline.value = true
  }

  onMounted(() => {
    nuxtApp.hook('transport:route-report' as any, onRouteReport)
    nuxtApp.hook('transport:scan-meta' as any, onScanMeta)
    nuxtApp.hook('transport:open' as any, onOpen)
    nuxtApp.hook('transport:close' as any, onClose)
    transport.connect().catch(() => { isOffline.value = true })
  })

  return { connect: transport.connect, disconnect: transport.disconnect }
}
