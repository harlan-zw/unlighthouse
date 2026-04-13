import type { UnlighthouseRouteReport } from '../types'

function escapeValueForCsv(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return `"${value.replace(/"/g, '""')}"`
}

export function csvSimpleFormat(reports: UnlighthouseRouteReport[]): { headers: string[], body: any } {
  const headers = ['URL', 'Score']
  Object.values(reports[0].report.categories).forEach((category) => {
    headers.push(category.title)
  })

  const body = reports
    .map(({ report, route }) => {
      const topLevelScoreKeys = []
      Object.keys(report.categories).forEach((category) => {
        topLevelScoreKeys.push(Math.round(report.categories[category].score * 100))
      })
      // map to the format
      return [
        route.path,
        Math.round(report.score * 100),
        // list all top level scores (performance, accessibility, etc)
        ...topLevelScoreKeys,
      ]
        .map(escapeValueForCsv)
    })

  return {
    headers,
    body,
  }
}

export function reportCSVSimple(reports: UnlighthouseRouteReport[]): string {
  const { headers, body } = csvSimpleFormat(reports)
  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
