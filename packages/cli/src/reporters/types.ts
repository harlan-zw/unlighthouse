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
  score?: string
}

export interface ExpandedRouteReport extends SimpleRouteReport {
  categories: {
    [key: string]: CategoryScore
  }
  metrics: {
    [key: string]: MetricScore
  }
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
