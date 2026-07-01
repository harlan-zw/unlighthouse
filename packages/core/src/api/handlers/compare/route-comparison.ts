import type { CompareRouteRow, RouteDiff } from '@unlighthouse/contracts/commands'
import type {
  Category,
  MetricName,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import { isRouteCategory, routeIdentityKey, routeMetricValue, routeNumericValue } from '../route-metrics'

export type CompareThresholds = Record<string, number>

export const DEFAULT_THRESHOLDS: CompareThresholds = {
  'lcp': 500,
  'cls': 0.1,
  'tbt': 200,
  'fcp': 300,
  'si': 500,
  'ttfb': 200,
  'inp': 200,
  'performance': 0.05,
  'accessibility': 0.05,
  'best-practices': 0.05,
  'seo': 0.05,
  'agentic-browsing': 0.05,
}

export const CATEGORY_ORDER: Category[] = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing']

export const CATEGORY_LABEL: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best Practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic Browsing',
}

const DIFF_METRICS: Array<MetricName | Category> = [
  'lcp',
  'cls',
  'inp',
  'fcp',
  'ttfb',
  'tbt',
  'si',
  'performance',
  'accessibility',
  'seo',
  'best-practices',
  'agentic-browsing',
]

const DETAIL_METRIC_KEYS = [
  'scorePerformance',
  'scoreAccessibility',
  'scoreSeo',
  'scoreBestPractices',
  'scoreAgenticBrowsing',
  'lcp',
  'cls',
  'inp',
  'fcp',
  'ttfb',
  'tbt',
  'si',
] as const

type DetailMetricKey = typeof DETAIL_METRIC_KEYS[number]
type DetailMetrics = CompareRouteRow['deltas']
type DetailStatus = CompareRouteRow['status']

const SCORE_KEYS = new Set<DetailMetricKey>([
  'scorePerformance',
  'scoreAccessibility',
  'scoreSeo',
  'scoreBestPractices',
  'scoreAgenticBrowsing',
])

const THRESHOLD_KEY: Record<DetailMetricKey, string> = {
  scorePerformance: 'performance',
  scoreAccessibility: 'accessibility',
  scoreSeo: 'seo',
  scoreBestPractices: 'best-practices',
  scoreAgenticBrowsing: 'agentic-browsing',
  lcp: 'lcp',
  cls: 'cls',
  inp: 'inp',
  fcp: 'fcp',
  ttfb: 'ttfb',
  tbt: 'tbt',
  si: 'si',
}

export interface CategoryDelta {
  category: Category
  label: string
  base: number | null
  current: number | null
  delta: number | null
}

export interface RouteComparison {
  thresholds: CompareThresholds
  regressions: RouteDiff[]
  improvements: RouteDiff[]
  added: RouteDiff[]
  removed: RouteDiff[]
  rows: CompareRouteRow[]
  counts: Record<DetailStatus, number>
}

export interface CompareRoutesInput {
  baseRoutes: ScanRoute[]
  currentRoutes: ScanRoute[]
  thresholds?: CompareThresholds
}

export interface DetailFilter {
  url?: string
  status?: 'all' | 'regressed' | 'improved' | 'changed' | 'added' | 'removed'
  device?: ScanRoute['device']
}

export function resolveThresholds(thresholds?: CompareThresholds): CompareThresholds {
  return { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) }
}

export function categoryDeltasFromSummaries(
  base: Partial<Record<Category, number>> | null | undefined,
  current: Partial<Record<Category, number>> | null | undefined,
): CategoryDelta[] {
  return CATEGORY_ORDER.map((category) => {
    const baseScore = base?.[category] ?? null
    const currentScore = current?.[category] ?? null
    const delta = baseScore != null && currentScore != null ? currentScore - baseScore : null
    return {
      category,
      label: CATEGORY_LABEL[category],
      base: baseScore,
      current: currentScore,
      delta,
    }
  })
}

export function compareRoutes(input: CompareRoutesInput): RouteComparison {
  const thresholds = resolveThresholds(input.thresholds)
  const baseByKey = new Map(input.baseRoutes.map(route => [routeIdentityKey(route), route]))
  const currentByKey = new Map(input.currentRoutes.map(route => [routeIdentityKey(route), route]))
  const allKeys = new Set([...baseByKey.keys(), ...currentByKey.keys()])

  const regressions: RouteDiff[] = []
  const improvements: RouteDiff[] = []
  const added: RouteDiff[] = []
  const removed: RouteDiff[] = []
  const rows: CompareRouteRow[] = []
  const counts: Record<DetailStatus, number> = {
    regressed: 0,
    improved: 0,
    added: 0,
    removed: 0,
    unchanged: 0,
  }

  for (const key of allKeys) {
    const baseRoute = baseByKey.get(key)
    const currentRoute = currentByKey.get(key)
    const route = currentRoute ?? baseRoute

    if (!route)
      continue

    const baseMetrics = baseRoute ? extractMetrics(baseRoute) : null
    const currentMetrics = currentRoute ? extractMetrics(currentRoute) : null
    const deltas = computeDeltas(baseMetrics, currentMetrics)
    const status = classifyRow(deltas, baseMetrics, currentMetrics, thresholds)
    rows.push({
      url: route.url,
      path: route.path,
      device: route.device,
      base: baseMetrics,
      current: currentMetrics,
      deltas,
      status,
    })
    counts[status]++

    if (baseRoute && !currentRoute) {
      const marker = routePresenceDiff(baseRoute, 'removed')
      if (marker)
        removed.push(marker)
      continue
    }

    if (currentRoute && !baseRoute) {
      const marker = routePresenceDiff(currentRoute, 'added')
      if (marker)
        added.push(marker)
      continue
    }

    if (!baseRoute || !currentRoute)
      continue

    for (const metric of DIFF_METRICS) {
      const baseVal = routeMetricValue(baseRoute, metric)
      const currentVal = routeMetricValue(currentRoute, metric)
      if (baseVal == null || currentVal == null)
        continue

      const delta = currentVal - baseVal
      const threshold = thresholds[metric] ?? 0
      const isScore = isRouteCategory(metric)
      const regressed = isScore ? -delta > threshold : delta > threshold
      const improved = isScore ? delta > threshold : -delta > threshold

      if (regressed || improved) {
        const diff: RouteDiff = {
          url: currentRoute.url,
          device: currentRoute.device,
          metric,
          base: baseVal,
          current: currentVal,
          delta,
          regressed,
        }
        ;(regressed ? regressions : improvements).push(diff)
      }
    }
  }

  return {
    thresholds,
    regressions,
    improvements,
    added,
    removed,
    rows,
    counts,
  }
}

export function selectDetailRows(rows: CompareRouteRow[], filter: DetailFilter = {}, sort = 'delta-perf-desc'): CompareRouteRow[] {
  let filtered = rows

  if (filter.url)
    filtered = filtered.filter(route => route.url.includes(filter.url!) || route.path.includes(filter.url!))

  if (filter.device)
    filtered = filtered.filter(route => route.device === filter.device)

  if (filter.status && filter.status !== 'all') {
    if (filter.status === 'changed')
      filtered = filtered.filter(route => route.status !== 'unchanged')
    else
      filtered = filtered.filter(route => route.status === filter.status)
  }

  return sortDetailRows(filtered, sort)
}

function sortDetailRows(rows: CompareRouteRow[], sort: string): CompareRouteRow[] {
  const sorted = [...rows]
  const [sortType, sortKey, sortDir] = sort.split('-')

  if (sortType === 'delta') {
    const metricKey = detailSortMetricKey(sortKey)
    sorted.sort((a, b) => {
      const av = a.deltas[metricKey] ?? 0
      const bv = b.deltas[metricKey] ?? 0
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }

  sorted.sort((a, b) => a.url.localeCompare(b.url))
  return sorted
}

function detailSortMetricKey(sortKey: string | undefined): DetailMetricKey {
  switch (sortKey) {
    case 'perf':
      return 'scorePerformance'
    case 'a11y':
      return 'scoreAccessibility'
    case 'seo':
      return 'scoreSeo'
    case 'bp':
      return 'scoreBestPractices'
    case 'agentic':
      return 'scoreAgenticBrowsing'
    case 'lcp':
      return 'lcp'
    case 'cls':
      return 'cls'
    default:
      return 'scorePerformance'
  }
}

function routePresenceDiff(route: ScanRoute, state: 'added' | 'removed'): RouteDiff | null {
  for (const metric of DIFF_METRICS) {
    if (!isRouteCategory(metric))
      continue

    const value = routeMetricValue(route, metric)
    if (value == null)
      continue

    return {
      url: route.url,
      device: route.device,
      metric,
      base: state === 'removed' ? value : null,
      current: state === 'added' ? value : null,
      delta: state === 'removed' ? -value : value,
      regressed: false,
    }
  }

  return null
}

function extractMetrics(route: ScanRoute): DetailMetrics {
  const metrics = {} as DetailMetrics
  for (const key of DETAIL_METRIC_KEYS)
    metrics[key] = routeNumericValue(route, key)
  return metrics
}

function computeDeltas(base: DetailMetrics | null, current: DetailMetrics | null): DetailMetrics {
  const deltas = {} as DetailMetrics
  for (const key of DETAIL_METRIC_KEYS)
    deltas[key] = base?.[key] != null && current?.[key] != null ? current[key]! - base[key]! : null
  return deltas
}

function classifyRow(
  deltas: DetailMetrics,
  base: DetailMetrics | null,
  current: DetailMetrics | null,
  thresholds: CompareThresholds,
): DetailStatus {
  if (!base)
    return 'added'
  if (!current)
    return 'removed'

  let hasRegression = false
  let hasImprovement = false

  for (const key of DETAIL_METRIC_KEYS) {
    const delta = deltas[key]
    if (delta == null)
      continue

    const isScore = SCORE_KEYS.has(key)
    const threshold = thresholds[THRESHOLD_KEY[key]] ?? (isScore ? 0.01 : 50)
    if (isScore ? -delta > threshold : delta > threshold)
      hasRegression = true
    if (isScore ? delta > threshold : -delta > threshold)
      hasImprovement = true
  }

  if (hasRegression)
    return 'regressed'
  if (hasImprovement)
    return 'improved'
  return 'unchanged'
}
