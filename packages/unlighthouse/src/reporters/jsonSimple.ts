import type { UnlighthouseRouteReport } from '../types'
import type { ReportJsonSimple, SimpleRouteReport } from './types'

export function reportJsonSimple(reports: UnlighthouseRouteReport[]): ReportJsonSimple {
  return reports
    .map((report) => {
      const scores: Record<string, number> = {}
      report.report?.categories.forEach((category) => {
        scores[category.key] = category.score ?? 0
      })
      // D-029: include device when present so multi-device matrix scans
      // emit one entry per (path, device). Omitted for legacy single-device
      // fixtures so existing snapshots stay stable.
      const row = <SimpleRouteReport> {
        path: report.route.path,
        score: report.report?.score,
        ...scores,
      }
      if (report.device)
        row.device = report.device
      return row
    })
}
