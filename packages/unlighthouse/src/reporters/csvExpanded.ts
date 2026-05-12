import type { UnlighthouseTabs } from '..'
import type { UnlighthouseRouteReport } from '../types'
import type { ReporterConfig } from './types'
import { get } from 'lodash-es'
import { csvSimpleFormat } from './csvSimple'

type ReportWithLighthouse = UnlighthouseRouteReport & {
  report: NonNullable<UnlighthouseRouteReport['report']>
}

interface CsvAuditValue {
  scoreDisplayMode?: string
  score?: number | null
  numericValue?: number
}

function isCsvAuditValue(value: unknown): value is CsvAuditValue {
  return typeof value === 'object' && value !== null && 'scoreDisplayMode' in value
}

function columnKeys(columns: ReporterConfig['columns']): UnlighthouseTabs[] {
  return columns ? Object.keys(columns) as UnlighthouseTabs[] : []
}

export function reportCSVExpanded(reports: ReportWithLighthouse[], { columns }: ReporterConfig = {}): string {
  const { headers, body } = csvSimpleFormat(reports)
  const firstReport = reports[0]
  if (!firstReport || !columns)
    return [headers.join(','), ...body.map(row => row.join(','))].join('\n')

  for (const k of columnKeys(columns)) {
    // already have overview
    if (k === 'overview')
      continue
    // check if k is within the reports
    if (!firstReport.report.categories.some(category => category.key === k))
      continue

    // add to headers
    headers.push(
      ...columns[k]
        .map(column => ({
          column,
          val: column.key ? get(firstReport, column.key) : undefined,
        }))
        .filter(({ val }) => isCsvAuditValue(val) && val.scoreDisplayMode !== 'informative' && val.scoreDisplayMode !== 'notApplicable')
        .map(({ column }) => column.label),
    )
  }

  reports.forEach(({ report }, i) => {
    for (const k of columnKeys(columns)) {
      // already have overview
      if (k === 'overview')
        continue
      // check if k is within the reports
      if (!firstReport.report.categories.some(category => category.key === k))
        continue

      // headers are good, now add body
      body[i].push(
        ...columns[k]
          .map(column => column.key ? get(report, column.key.replace('report.', '')) : undefined)
          .filter(isCsvAuditValue)
          .filter(val => val.scoreDisplayMode !== 'informative' && val.scoreDisplayMode !== 'notApplicable')
          .map((val) => {
            if (val.scoreDisplayMode === 'binary')
              return val.score ?? ''
            if (val.scoreDisplayMode === 'numeric')
              // round to 2 decimal places
              return typeof val.numericValue === 'number' ? Math.round(val.numericValue * 100) / 100 : ''
            return val.score ?? ''
          }),
      )
    }
  })

  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
