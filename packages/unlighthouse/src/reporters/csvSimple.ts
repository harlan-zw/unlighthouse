import type { UnlighthouseRouteReport } from '../types'
import type { ReportWithLighthouse } from './types'
import { hasLighthouseReport } from './types'

function escapeValueForCsv(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return `"${value.replace(/"/g, '""')}"`
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

// D-029: append the device column last so the existing
// `URL,Score,<categories>[,<expanded columns>]` prefix is preserved for
// callers parsing positional indices. Mutates `headers` + `body` in place
// — both `reportCSVSimple` and `reportCSVExpanded` call this after their
// own column work, keeping device as the rightmost column.
export function appendDeviceColumn(
  headers: string[],
  body: Array<Array<string | number | boolean>>,
  reports: Array<{ device?: string }>,
): void {
  headers.push('Device')
  reports.forEach((r, i) => {
    if (!body[i])
      return
    body[i].push(escapeValueForCsv(r.device ?? ''))
  })
}

export function reportCSVSimple(reports: UnlighthouseRouteReport[]): string {
  const filtered = reports.filter(hasLighthouseReport)
  const { headers, body } = csvSimpleFormat(filtered)
  appendDeviceColumn(headers, body, filtered)
  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
