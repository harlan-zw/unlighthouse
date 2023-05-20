import type { CategoryAverageScore, CategoryScore, ExpandedRouteReport, MetricAverageScore, MetricScore, ReportJsonExpanded } from './types'

const relevantMetrics = [
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'first-contentful-paint',
  'total-blocking-time',
  'max-potential-fid',
  'interactive',
]

export function reportJsonExpanded(unlighthouseRouteReports): ReportJsonExpanded {
  const routes = unlighthouseRouteReports
    .map((report) => {
      const categories = Object.values(report.report?.categories ?? {}).reduce(
        (prev: { [key: string]: CategoryScore }, category: any): any => ({
          ...prev,
          [category.key]: {
            key: category.key,
            id: category.id,
            title: category.title,
            score: category.score,
          },
        }),
        {},
      )
      const metrics = Object.values(report.report?.audits ?? {})
        .filter((metric: any) => relevantMetrics.includes(metric.id))
        .reduce((prev: { [key: string]: any }, metric: any): any => ({
          ...prev,
          [metric.id]: {
            id: metric.id,
            title: metric.title,
            description: metric.description,
            numericValue: metric.numericValue,
            numericUnit: metric.numericUnit,
            displayValue: metric.displayValue,
          },
        }), {})
      return <ExpandedRouteReport> {
        path: report.route.path,
        score: report.report?.score,
        categories,
        metrics,
      }
    })
    // make the list ordering consistent
    .sort((a, b) => a.path.localeCompare(b.path))

  const averageCategories = extractCategoriesFromRoutes(routes)
  const averageMetrics = extractMetricsFromRoutes(routes)

  const summary = {
    score: parseFloat(
      (
        routes.reduce((prev, curr) => prev + curr.score, 0) / routes.length
      ).toFixed(2),
    ),
    categories: averageCategories,
    metrics: averageMetrics,
  }
  return {
    summary,
    routes,
  }
}

function extractCategoriesFromRoutes(routes: ExpandedRouteReport[]) {
  const categoriesWithAllScores = routes.reduce((prev, curr) => {
    return Object.keys(curr.categories).reduce((target, categoryKey) => {
      const scores = target[categoryKey] ? target[categoryKey].scores : []
      return {
        ...target,
        [categoryKey]: {
          ...curr.categories[categoryKey],
          scores: [...scores, curr.categories[categoryKey].score],
        },
      }
    }, prev)
  }, {} as { [key: string]: { key: string; id: string; title: string; scores: number[] } })

  // returns averageCategories
  return Object.keys(categoriesWithAllScores).reduce(
    (
      prev: {
        [key: string]: CategoryAverageScore
      },
      key: string,
    ) => {
      const averageScore = parseFloat(
        (
          categoriesWithAllScores[key].scores.reduce(
            (prev, curr) => prev + curr,
            0,
          ) / categoriesWithAllScores[key].scores.length
        ).toFixed(2),
      )
      const { ...strippedCategory }
        = categoriesWithAllScores[key]
      return { ...prev, [key]: { ...strippedCategory, averageScore } }
    },
    {} as {
      [key: string]: CategoryAverageScore
    },
  )
}

function extractMetricsFromRoutes(routes: ExpandedRouteReport[]) {
  const metricsWithAllNumericValues = routes.reduce((prev, curr) => {
    return Object.keys(curr.metrics).reduce((target, metricKey) => {
      const numericValues = target[metricKey]
        ? target[metricKey].numericValues
        : []
      return {
        ...target,
        [metricKey]: {
          ...curr.metrics[metricKey],
          numericValues: [...numericValues, curr.metrics[metricKey].numericValue],
        },
      }
    }, prev)
  }, {} as { [key: string]: Omit<MetricScore, 'numericValue'> & { numericValues: number[] } })

  // average metrics
  return Object.keys(metricsWithAllNumericValues).reduce(
    (prev: { [key: string]: MetricAverageScore }, key: string) => {
      const averageNumericValue = parseFloat(
        (
          metricsWithAllNumericValues[key].numericValues.reduce(
            (prev, curr) => prev + curr,
            0,
          ) / metricsWithAllNumericValues[key].numericValues.length
        ).toFixed(2),
      )
      const { ...strippedMetric }
        = metricsWithAllNumericValues[key]
      return { ...prev, [key]: { ...strippedMetric, averageNumericValue } }
    },
    {} as { [key: string]: MetricAverageScore },
  )
}
