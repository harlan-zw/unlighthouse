import type { UnlighthouseRouteReport } from '../types'

function escapeValueForCsv(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return `"${value.replace(/"/g, '""')}"`
}

type ReportWithLighthouse = UnlighthouseRouteReport & {
  report: NonNullable<UnlighthouseRouteReport['report']>
}

function hasLighthouseReport(report: UnlighthouseRouteReport): report is ReportWithLighthouse {
  return !!report.report
}

export function csvSimpleFormat(reports: ReportWithLighthouse[]): { headers: string[], body: Array<Array<string | number | boolean>> } {
  const headers = ['URL', 'Score']
  const firstReport = reports[0]
  if (!firstReport)
    return { headers, body: [] }

  firstReport.report.categories.forEach((category) => {
    headers.push(category.title)
  })

  const body = reports
    .map(({ report, route }) => {
      const topLevelScoreKeys: number[] = []
      report.categories.forEach((category) => {
        topLevelScoreKeys.push(Math.round((category.score ?? 0) * 100))
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
  const { headers, body } = csvSimpleFormat(reports.filter(hasLighthouseReport))
  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
