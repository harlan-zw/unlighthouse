export interface CategoryScore {
  key: string
  id: string
  title: string
  score: number
}

export interface MetricScore {
  id: string
  title: string
  description: string
  numericValue: number
  numericUnit: string
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
  key: string
  id: string
  title: string
  averageScore: number
}

export interface MetricAverageScore {
  id: string
  title: string
  description: string
  averageNumericValue: number
  numericUnit: string
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
}

export type ReportJsonSimple = SimpleRouteReport[]
