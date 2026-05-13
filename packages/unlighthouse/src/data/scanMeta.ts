import type { ScanMeta, UnlighthouseWorker } from '../types'

export interface ScanMetaDeps {
  worker: UnlighthouseWorker
}

export function createScanMeta(deps: ScanMetaDeps): ScanMeta {
  const { worker } = deps

  const data = worker.reports().filter(r => r.tasks.inspectHtmlTask === 'completed')
  const reportsWithScore = data.filter(r => r.report?.score) as { report: { score: number } }[]
  const score = (reportsWithScore
    .map(r => r.report.score)
    .reduce((s, a) => s + a, 0) / reportsWithScore.length) || 0

  return {
    favicon: data?.[0]?.seo?.favicon,
    monitor: worker.monitor(),
    routes: data.length || 0,
    score,
  }
}
