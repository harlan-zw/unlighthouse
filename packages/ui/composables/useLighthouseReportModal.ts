import type { UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { useUnlighthouseConfig } from './useUnlighthouseConfig'

export function useLighthouseReportModal() {
  const isOpen = useState<boolean>('unlighthouse:lh-modal-open', () => false)
  const url = useState<string>('unlighthouse:lh-modal-url', () => '')

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
