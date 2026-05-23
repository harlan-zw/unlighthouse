import type { UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

// D-029: matrix scans may have both mobile + desktop iframe URLs for the same
// route. The modal carries both so the device tabs can swap iframes without
// re-opening.
export interface LighthouseReportModalDevices {
  mobile?: string
  desktop?: string
}

function resolveReportUrl(report: UnlighthouseRouteReport | any): string {
  if (!report)
    return ''
  if (report.artifactUrl) {
    // Static client: artifactUrl already points at the report directory; the
    // file lives at /lighthouse.html beneath it.
    return report.artifactUrl.endsWith('.html')
      ? report.artifactUrl
      : `${report.artifactUrl.replace(/\/$/, '')}/lighthouse.html`
  }
  const { apiUrl } = useUnlighthouseConfig()
  if (apiUrl.value && report.route?.path) {
    const path = encodeURIComponent(report.route.path || '/')
    return `${apiUrl.value}/reports/${path}/lighthouse.html`
  }
  return ''
}

export function useLighthouseReportModal() {
  const isOpen = useState<boolean>('unlighthouse:lh-modal-open', () => false)
  const url = useState<string>('unlighthouse:lh-modal-url', () => '')
  const devices = useState<LighthouseReportModalDevices>('unlighthouse:lh-modal-devices', () => ({}))
  const activeDevice = useState<'mobile' | 'desktop' | null>('unlighthouse:lh-modal-device', () => null)

  function open(report: UnlighthouseRouteReport | any) {
    if (!report?.artifactUrl && !report?.route?.path)
      return

    const reportUrl = resolveReportUrl(report)
    if (reportUrl) {
      url.value = reportUrl
      devices.value = report?.device
        ? { [report.device]: reportUrl } as LighthouseReportModalDevices
        : {}
      activeDevice.value = report?.device ?? null
      isOpen.value = true
    }
  }

  // Open the modal for a (url, device)-grouped pair. When both reports are
  // present the modal renders device tabs; when only one, falls back to the
  // single iframe.
  function openGroup(group: { mobile?: UnlighthouseRouteReport, desktop?: UnlighthouseRouteReport }, preferred?: 'mobile' | 'desktop') {
    const next: LighthouseReportModalDevices = {}
    if (group.mobile)
      next.mobile = resolveReportUrl(group.mobile)
    if (group.desktop)
      next.desktop = resolveReportUrl(group.desktop)
    const initial = preferred && next[preferred]
      ? preferred
      : (next.mobile ? 'mobile' : (next.desktop ? 'desktop' : null))
    const initialUrl = initial ? next[initial] : ''
    if (!initialUrl)
      return
    devices.value = next
    activeDevice.value = initial
    url.value = initialUrl
    isOpen.value = true
  }

  function setActiveDevice(device: 'mobile' | 'desktop') {
    const next = devices.value[device]
    if (!next)
      return
    activeDevice.value = device
    url.value = next
  }

  function close() {
    isOpen.value = false
    url.value = ''
    devices.value = {}
    activeDevice.value = null
  }

  return { isOpen, url, devices, activeDevice, open, openGroup, setActiveDevice, close }
}
