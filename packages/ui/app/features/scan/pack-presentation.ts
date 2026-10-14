import type { PerformanceSource } from '@unlighthouse/contracts/types/atoms'
import { formatMetricValue } from '../../utils/format'

export function formatRouteCount(count: number): string {
  return `${count} ${count === 1 ? 'route' : 'routes'}`
}

export interface ReportCoverage { eligible: number, analysed: number, missing: number }

export function categoryCoverageSummary(coverage: ReportCoverage, findingCount: number) {
  return {
    title: coverage.analysed === 0 ? 'No reports available for this category' : findingCount > 0 ? null : 'No findings in available reports',
    scope: `Reports available for ${coverage.analysed} of ${coverage.eligible} entries`,
    missing: coverage.missing > 0 ? `${coverage.missing} reports unavailable` : null,
  }
}

export function formatInsightSavings(metric: string, value: number | null | undefined): string {
  if (value == null)
    return '—'
  return metric.toLowerCase() === 'cls' ? formatMetricValue(value, '') : `${Math.round(value)} ms`
}

export function performanceSourceLabel(source: string): string {
  switch (source) {
    case 'lab': return 'Lighthouse lab results'
    case 'field': return 'Field measurements'
    case 'mixed': return 'Mixed measurement sources'
    default: return 'Measurement source unavailable'
  }
}

export function performanceSourceDetails(source: PerformanceSource): string[] {
  switch (source._tag) {
    case 'lab': return ['Lighthouse lab results', source.auditor ?? 'Measurement source unavailable', source.capturedAt]
    case 'field': return [
      source.scope === 'url' ? 'URL field data' : 'Origin field data',
      source.scopeUrl,
      source.auditor ?? 'Measurement source unavailable',
      source.collectionPeriod ? `${source.collectionPeriod.firstDate} to ${source.collectionPeriod.lastDate}` : 'Collection period unavailable',
    ]
    case 'unavailable': return ['Measurement source unavailable', source.reason]
  }
}
