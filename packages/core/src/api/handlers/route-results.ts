import type { RouteFilter, RouteSort } from '@unlighthouse/contracts/ports'
import type {
  Category,
  MetricName,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import { routeMetricValue, routeNumericValue } from './route-metrics'

export interface RouteFilterInput {
  minScore?: RouteFilter['minScore']
  maxMetric?: RouteFilter['maxMetric']
  urlPattern?: string
}

export function isLiteralUrlPattern(pattern: string): boolean {
  return /^[\w./\-:?#]+$/.test(pattern)
}

export function routeFilterForStorage(filter?: RouteFilterInput, urlPattern?: string): RouteFilter | undefined {
  const pattern = filter?.urlPattern ?? urlPattern
  const storageFilter: RouteFilter = {
    minScore: filter?.minScore,
    maxMetric: filter?.maxMetric,
    urlPattern: pattern && isLiteralUrlPattern(pattern) ? pattern : undefined,
  }

  if (!storageFilter.minScore && !storageFilter.maxMetric && !storageFilter.urlPattern)
    return undefined
  return storageFilter
}

export function applyRouteRegexFallback(items: ScanRoute[], urlPattern: string | undefined, storageFilter?: RouteFilter): ScanRoute[] {
  if (!urlPattern || storageFilter?.urlPattern != null)
    return items

  const matcher = new RegExp(urlPattern)
  return items.filter(route => matcher.test(route.url))
}

export function applyRouteFilter(items: ScanRoute[], filter: RouteFilterInput | undefined): ScanRoute[] {
  if (!filter)
    return items

  return items.filter((route) => {
    if (filter.urlPattern && !new RegExp(filter.urlPattern).test(route.url))
      return false

    if (filter.minScore) {
      for (const [category, min] of Object.entries(filter.minScore)) {
        const value = routeMetricValue(route, category as Category)
        if (value == null || value < (min as number))
          return false
      }
    }

    if (filter.maxMetric) {
      for (const [metric, max] of Object.entries(filter.maxMetric)) {
        const value = routeMetricValue(route, metric as MetricName)
        if (value != null && value > (max as number))
          return false
      }
    }

    return true
  })
}

export function applyRouteSort(items: ScanRoute[], sort?: RouteSort): ScanRoute[] {
  if (!sort)
    return items

  const sorted = [...items]
  const numSort = (key: keyof ScanRoute, asc: boolean) => (a: ScanRoute, b: ScanRoute) => {
    const av = routeNumericValue(a, key) ?? (asc ? Infinity : -Infinity)
    const bv = routeNumericValue(b, key) ?? (asc ? Infinity : -Infinity)
    return asc ? av - bv : bv - av
  }

  const sortFn: Record<RouteSort, (a: ScanRoute, b: ScanRoute) => number> = {
    'score-asc': numSort('scorePerformance', true),
    'score-desc': numSort('scorePerformance', false),
    'lcp-asc': numSort('lcp', true),
    'lcp-desc': numSort('lcp', false),
    'cls-asc': numSort('cls', true),
    'cls-desc': numSort('cls', false),
    'fcp-asc': numSort('fcp', true),
    'fcp-desc': numSort('fcp', false),
    'tbt-asc': numSort('tbt', true),
    'tbt-desc': numSort('tbt', false),
    'ttfb-asc': numSort('ttfb', true),
    'ttfb-desc': numSort('ttfb', false),
    'si-asc': numSort('si', true),
    'si-desc': numSort('si', false),
    'inp-asc': numSort('inp', true),
    'inp-desc': numSort('inp', false),
    'url-asc': (a, b) => a.url.localeCompare(b.url),
    'capturedAt-desc': (a, b) => b.capturedAt.localeCompare(a.capturedAt),
  }

  sorted.sort(sortFn[sort])
  return sorted
}

export function projectRoute(route: ScanRoute, projection: readonly string[]): ScanRoute {
  const keep = new Set(projection)
  const out: Record<string, unknown> = {
    url: route.url,
    path: route.path,
    scanId: route.scanId,
    device: route.device,
    lhrBlobKey: route.lhrBlobKey,
    reportBlobKey: route.reportBlobKey,
    screenshotBlobKey: route.screenshotBlobKey,
    capturedAt: route.capturedAt,
    lighthouseVersion: route.lighthouseVersion,
    routeName: route.routeName,
    scorePerformance: route.scorePerformance,
    scoreAccessibility: route.scoreAccessibility,
    scoreSeo: route.scoreSeo,
    scoreBestPractices: route.scoreBestPractices,
    scoreAgenticBrowsing: route.scoreAgenticBrowsing,
  }

  for (const metric of ['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'])
    out[metric] = keep.has(metric) ? routeNumericValue(route, metric) : null

  return out as unknown as ScanRoute
}
