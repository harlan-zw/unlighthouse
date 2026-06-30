import type {
  Category,
  MetricName,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'

export type RouteMetric = Category | MetricName

export const ROUTE_CATEGORY_SCORE_COLUMN = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
  'agentic-browsing': 'scoreAgenticBrowsing',
} as const satisfies Record<Category, keyof ScanRoute>

export function routeIdentityKey(route: Pick<ScanRoute, 'url' | 'device'>): string {
  return `${route.url}|${route.device}`
}

export function isRouteCategory(value: string): value is Category {
  return value in ROUTE_CATEGORY_SCORE_COLUMN
}

export function routeMetricColumn(metric: RouteMetric): keyof ScanRoute {
  return isRouteCategory(metric) ? ROUTE_CATEGORY_SCORE_COLUMN[metric] : metric
}

export function routeNumericValue(route: ScanRoute, column: keyof ScanRoute | string): number | null {
  const value = (route as unknown as Record<string, unknown>)[column]
  return typeof value === 'number' ? value : null
}

export function routeMetricValue(route: ScanRoute, metric: RouteMetric): number | null {
  return routeNumericValue(route, routeMetricColumn(metric))
}
