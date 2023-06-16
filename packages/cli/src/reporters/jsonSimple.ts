import type { UnlighthouseRouteReport } from '../types'
import type { ReportJsonSimple } from './types'

export function reportJsonSimple(reports: UnlighthouseRouteReport[]): ReportJsonSimple {
  return reports
    .map((report) => {
      const scores: Record<string, number> = {}
      Object.values(report.report.categories).forEach((category) => {
        // @ts-expect-error untyped
        scores[category.key] = category.score
      })
      return {
        path: report.route.path,
        score: report.report?.score,
        ...scores,
      }
    })
}
