import type { UnlighthouseRouteReport } from '@unlighthouse/contracts'

const reportsState = () => useState<UnlighthouseRouteReport[]>('unlighthouse:reports', () => [])

export function useReports() {
  const reports = reportsState()

  function onRouteReport(report: UnlighthouseRouteReport) {
    const idx = reports.value.findIndex(r => r.route.path === report.route.path)
    if (idx >= 0)
      reports.value[idx] = report
    else
      reports.value.push(report)
  }

  function clearReports() {
    reports.value = []
  }

  return { reports, onRouteReport, clearReports }
}
