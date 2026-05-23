import type { UnlighthouseColumn, UnlighthouseTabs } from '../index.ts'

export interface CategoryScore {
  key: string
  id: string
  title: string
  score: number
}

export interface MetricScore {
  numericValue: number
  displayValue: string
}

export interface SimpleRouteReport {
  path: string
  score?: number | string | null | undefined
  /**
   * D-029: device form-factor for the audited row. Only emitted when the
   * source report carries it — legacy single-device callers still get the
   * historical `path,score,<categories>` shape.
   */
  device?: 'mobile' | 'desktop'
  [key: string]: string | number | null | undefined
}

export interface ExpandedRouteReport {
  path: string
  score: number
  categories: {
    [key: string]: CategoryScore
  }
  metrics: {
    [key: string]: MetricScore
  }
  /**
   * D-029: device form-factor for the audited row. See `SimpleRouteReport.device`.
   */
  device?: 'mobile' | 'desktop'
}

export interface CategoryAverageScore {
  averageScore: number
}

export interface MetricAverageScore {
  averageNumericValue: number
}

export interface MetricMetadata {
  id: string
  title: string
  description: string
  numericUnit: string
}

export interface CategoryMetadata {
  id: string
  title: string
}

export interface ReportJsonExpanded {
  summary: {
    score: number
    categories: {
      [key: string]: CategoryAverageScore
    }
    metrics: {
      [key: string]: MetricAverageScore
    }
  }
  routes: ExpandedRouteReport[]
  metadata: {
    metrics: {
      [key: string]: MetricMetadata
    }
    categories: {
      [key: string]: CategoryMetadata
    }
  }
}

export type ReportJsonSimple = SimpleRouteReport[]

export type ReporterConfig = Partial<{
  columns: Record<UnlighthouseTabs, UnlighthouseColumn[]>
  lhciHost: string
  lhciBuildToken: string
  lhciAuth: string
}>
