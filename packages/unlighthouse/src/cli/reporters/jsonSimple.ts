import type { UnlighthouseRouteReport } from '../types'
import type { ReportJsonSimple, SimpleRouteReport } from './types'

export function reportJsonSimple(reports: UnlighthouseRouteReport[]): ReportJsonSimple {
  return reports
    .map((report) => {
      const scores: Record<string, number> = {}
      report.report?.categories.forEach((category) => {
        scores[category.key] = category.score ?? 0
      })
      return <SimpleRouteReport> {
        path: report.route.path,
        score: report.report?.score,
        ...scores,
      }
    })
}
