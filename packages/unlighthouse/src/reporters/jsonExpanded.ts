import type { UnlighthouseRouteReport } from '../index.ts'
import type { CategoryAverageScore, ExpandedRouteReport, MetricAverageScore, MetricScore, ReportJsonExpanded } from './types'

const relevantMetrics = [
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'first-contentful-paint',
  'total-blocking-time',
  'max-potential-fid',
  'interactive',
] as const

type RelevantMetric = typeof relevantMetrics[number]

function isRelevantMetric(id: string): id is RelevantMetric {
  return (relevantMetrics as readonly string[]).includes(id)
}

export function reportJsonExpanded(reports: UnlighthouseRouteReport[]): ReportJsonExpanded {
  const metadata: ReportJsonExpanded['metadata'] = {
    metrics: {},
    categories: {},
  }
  const routes = reports
    .map((report) => {
      const categories: ExpandedRouteReport['categories'] = {}
      for (const category of Object.values(report.report?.categories ?? {})) {
        metadata.categories[category.key] = {
          id: category.id,
          title: category.title,
          categoryScoreDisplayMode: category.categoryScoreDisplayMode,
        }
        categories[category.key] = {
          key: category.key,
          id: category.id,
          title: category.title,
          score: category.score,
          categoryScoreDisplayMode: category.categoryScoreDisplayMode,
        }
      }

      const metrics: ExpandedRouteReport['metrics'] = {}
      for (const metric of Object.values(report.report?.audits ?? {})) {
        if (!metric.id || !isRelevantMetric(metric.id))
          continue
        metadata.metrics[metric.id] = {
          id: metric.id,
          title: metric.title ?? metric.id,
          description: metric.description ?? '',
          numericUnit: metric.numericUnit ?? '',
        }
        metrics[metric.id] = {
          numericValue: typeof metric.numericValue === 'number' ? metric.numericValue : 0,
          displayValue: metric.displayValue ?? '',
        }
      }
      // D-029: device dimension carried through so the expanded JSON
      // surfaces matrix scans as one route entry per (path, device).
      // Field is only set when present on the input to keep legacy
      // single-device output unchanged.
      const row = <ExpandedRouteReport>{
        path: report.route.path,
        score: report.report?.score ?? 0,
        categories,
        metrics,
      }
      if (report.device)
        row.device = report.device
      return row
    })
    // make the list ordering consistent. Stable secondary sort by device
    // so multi-device matrix scans always emit `desktop` before `mobile`
    // (alphabetical) for the same path.
    .sort((a, b) => a.path.localeCompare(b.path) || (a.device ?? '').localeCompare(b.device ?? ''))

  const averageCategories = extractCategoriesFromRoutes(routes)
  const averageMetrics = extractMetricsFromRoutes(routes)

  const summary = {
    score: Number.parseFloat(
      (
        routes.reduce((prev, curr) => prev + curr.score, 0) / (routes.length || 1)
      ).toFixed(2),
    ),
    categories: averageCategories,
    metrics: averageMetrics,
  }
  return {
    summary,
    routes,
    metadata,
  }
}

function extractCategoriesFromRoutes(routes: ExpandedRouteReport[]) {
  const categoriesWithAllScores = routes.reduce((prev, curr) => {
    return Object.entries(curr.categories).reduce((target, [categoryKey, category]) => {
      const scores = target[categoryKey]?.scores ?? []
      const { ...strippedCategory } = category
      return {
        ...target,
        [categoryKey]: {
          ...strippedCategory,
          scores: [...scores, category.score ?? 0],
        },
      }
    }, prev)
  }, {} as { [key: string]: { key: string, id: string, title: string, scores: number[] } })

  // returns averageCategories
  return Object.keys(categoriesWithAllScores).reduce(
    (
      prev: {
        [key: string]: CategoryAverageScore
      },
      key: string,
    ) => {
      const category = categoriesWithAllScores[key]
      if (!category)
        return prev
      const averageScore = Number.parseFloat(
        (
          category.scores.reduce(
            (prev, curr) => prev + curr,
            0,
          ) / (category.scores.length || 1)
        ).toFixed(2),
      )
      const { ...strippedCategory } = category
      return { ...prev, [key]: { ...strippedCategory, averageScore } }
    },
    {} as {
      [key: string]: CategoryAverageScore
    },
  )
}

function extractMetricsFromRoutes(routes: ExpandedRouteReport[]) {
  const metricsWithAllNumericValues = routes.reduce((prev, curr) => {
    return Object.entries(curr.metrics).reduce((target, [metricKey, metric]) => {
      const numericValues = target[metricKey]?.numericValues ?? []
      const { ...strippedMetric } = metric
      return {
        ...target,
        [metricKey]: {
          ...strippedMetric,
          numericValues: [...numericValues, metric.numericValue],
        },
      }
    }, prev)
  }, {} as { [key: string]: Omit<MetricScore, 'numericValue' | 'displayValue'> & { numericValues: number[] } })

  // average metrics
  return Object.keys(metricsWithAllNumericValues).reduce(
    (prev: { [key: string]: MetricAverageScore }, key: string) => {
      const metric = metricsWithAllNumericValues[key]
      if (!metric)
        return prev
      const averageNumericValue = Number.parseFloat(
        (
          metric.numericValues.reduce(
            (prev, curr) => prev + curr,
            0,
          ) / (metric.numericValues.length || 1)
        ).toFixed(2),
      )
      const { ...strippedMetric } = metric
      return { ...prev, [key]: { ...strippedMetric, averageNumericValue } }
    },
    {} as { [key: string]: MetricAverageScore },
  )
}
