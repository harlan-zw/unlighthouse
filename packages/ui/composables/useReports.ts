import type { UnlighthouseRouteReport } from '@unlighthouse/contracts'

const reportsState = () => useState<UnlighthouseRouteReport[]>('unlighthouse:reports', () => [])

export function useReports() {
  const reports = reportsState()

  function onRouteReport(report: UnlighthouseRouteReport) {
    // D-029: matrix scans emit one report per (url, device). Key by both so
    // mobile + desktop rows for the same path don't overwrite each other.
    const idx = reports.value.findIndex(r =>
      r.route.path === report.route.path
      && (r.device ?? null) === (report.device ?? null),
    )
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
