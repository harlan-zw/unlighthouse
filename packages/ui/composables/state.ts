import type { ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { useApiClient } from './useApiClient'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

export const unlighthouseReports = useState<UnlighthouseRouteReport[]>('unlighthouse:reports', () => [])
export const scanMeta = useState<ScanMeta | null>('unlighthouse:scan-meta', () => null)
export const isOffline = useState<boolean>('unlighthouse:offline', () => false)
export const lighthouseReportModalOpen = useState<boolean>('unlighthouse:lh-modal-open', () => false)
export const iframeModalUrl = useState<string>('unlighthouse:lh-modal-url', () => '')

// Side-channel: search.ts reads `report.categoryMap` for sort/filter projection.
// We compute it once at ingest so the search computed stays pure.
function projectCategoryMap(report: UnlighthouseRouteReport) {
  if (!report.report?.categories || !Array.isArray(report.report.categories))
    return
  const map: Record<string, unknown> = {}
  const categories = report.report.categories as unknown as Array<{ id?: string } & Record<string, unknown>>
  for (const c of categories) {
    if (c?.id)
      map[c.id] = c
  }
  ;(report.report as any).categoryMap = map
}

export function useReports() {
  const reports = unlighthouseReports

  function onRouteReport(report: UnlighthouseRouteReport) {
    projectCategoryMap(report)
    const idx = reports.value.findIndex(r => r.route.path === report.route.path)
    if (idx >= 0)
      reports.value[idx] = report
    else
      reports.value.push(report)
  }

  function clearReports() {
    reports.value = []
  }

  return { reports, scanMeta, isOffline, onRouteReport, clearReports, refreshScanMeta }
}

export async function refreshScanMeta() {
  const client = useApiClient()
  const data = await client['scan.meta']({}).catch(() => null)
  if (data)
    scanMeta.value = data as unknown as ScanMeta
}

export function useReportsStream() {
  const nuxtApp = useNuxtApp()
  const transport = nuxtApp.$transport as { connect: () => Promise<void>, disconnect: () => void }
  const { scanMeta, isOffline, onRouteReport } = useReports()

  onMounted(() => {
    nuxtApp.hook('transport:route-report', onRouteReport)
    nuxtApp.hook('transport:scan-meta', (meta) => {
      scanMeta.value = meta
    })
    nuxtApp.hook('transport:open', () => {
      isOffline.value = false
    })
    nuxtApp.hook('transport:close', () => {
      isOffline.value = true
    })
    transport.connect().catch(() => {
      isOffline.value = true
    })
  })

  return { connect: transport.connect, disconnect: transport.disconnect }
}

export function useLighthouseReportModal() {
  const isOpen = lighthouseReportModalOpen
  const url = iframeModalUrl

  function open(report: UnlighthouseRouteReport | any) {
    if (!report?.artifactUrl && !report?.route?.path)
      return

    const { apiUrl } = useUnlighthouseConfig()
    let reportUrl = report.artifactUrl
    if (!reportUrl && apiUrl.value) {
      const path = encodeURIComponent(report.route?.path || '/')
      reportUrl = `${apiUrl.value}/reports/${path}/lighthouse.html`
    }

    if (reportUrl) {
      url.value = reportUrl
      isOpen.value = true
    }
  }

  function close() {
    isOpen.value = false
    url.value = ''
  }

  return { isOpen, url, open, close }
}

export function openLighthouseReportIframeModal(report: UnlighthouseRouteReport | any) {
  useLighthouseReportModal().open(report)
}
