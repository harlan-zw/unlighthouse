import type { UnlighthouseTabs } from '../index.ts'
import type { ReporterConfig, ReportWithLighthouse } from './types'
import { appendDeviceColumn, csvSimpleFormat } from './csvSimple'

interface CsvAuditValue {
  scoreDisplayMode?: string
  score?: number | null
  numericValue?: number
}

function isCsvAuditValue(value: unknown): value is CsvAuditValue {
  return typeof value === 'object' && value !== null && 'scoreDisplayMode' in value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function columnKeys(columns: ReporterConfig['columns']): UnlighthouseTabs[] {
  return columns ? Object.keys(columns) as UnlighthouseTabs[] : []
}

function getPathValue(source: unknown, path: string): unknown {
  return path.split('.').filter(Boolean).reduce<unknown>((current, part) => {
    if (!isRecord(current))
      return undefined
    return current[part]
  }, source)
}

export function reportCSVExpanded(reports: ReportWithLighthouse[], { columns }: ReporterConfig = {}): string {
  const { headers, body } = csvSimpleFormat(reports)
  const firstReport = reports[0]
  if (!firstReport || !columns) {
    // D-029: device column belongs at the end of the row even when no
    // expanded columns are configured.
    appendDeviceColumn(headers, body, reports)
    return [headers.join(','), ...body.map(row => row.join(','))].join('\n')
  }

  for (const k of columnKeys(columns)) {
    const columnsForKey = columns[k]
    if (!columnsForKey)
      continue
    // already have overview
    if (k === 'overview')
      continue
    // check if k is within the reports
    if (!firstReport.report.categories.some(category => category.key === k))
      continue

    // add to headers
    headers.push(
      ...columnsForKey
        .map(column => ({
          column,
          val: column.key ? getPathValue(firstReport, column.key) : undefined,
        }))
        .filter(({ val }) => isCsvAuditValue(val) && val.scoreDisplayMode !== 'informative' && val.scoreDisplayMode !== 'notApplicable')
        .map(({ column }) => column.label),
    )
  }

  reports.forEach(({ report }, i) => {
    const row = body[i]
    if (!row)
      return
    for (const k of columnKeys(columns)) {
      const columnsForKey = columns[k]
      if (!columnsForKey)
        continue
      // already have overview
      if (k === 'overview')
        continue
      // check if k is within the reports
      if (!firstReport.report.categories.some(category => category.key === k))
        continue

      // headers are good, now add body
      row.push(
        ...columnsForKey
          .map(column => column.key ? getPathValue(report, column.key.replace('report.', '')) : undefined)
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

  // D-029: device column appended last so any future expanded columns can
  // be added before it without breaking parsers anchored at the end.
  appendDeviceColumn(headers, body, reports)

  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
