import type { UnlighthouseRouteReport } from '../types'
import type { ReportJsonSimple } from './types'

export function reportJsonSimple(reports: UnlighthouseRouteReport[]): ReportJsonSimple {
  return reports
    .map((report) => {
      return {
        path: report.route.path,
        score: report.report?.score,
      }
    })
    // make the list ordering consistent
    .sort((a, b) => a.path.localeCompare(b.path))
}
