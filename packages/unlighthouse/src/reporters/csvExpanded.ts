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

function isExportedAudit(value: unknown): value is CsvAuditValue {
  return isCsvAuditValue(value) && !!value.scoreDisplayMode
    && value.scoreDisplayMode !== 'informative' && value.scoreDisplayMode !== 'notApplicable'
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
  const exportedColumns = columnKeys(columns).flatMap((key) => {
    if (key === 'overview' || !reports.some(({ report }) => report.categories.some(category => category.key === key)))
      return []
    return (columns?.[key] ?? []).filter(column => reports.some(report =>
      isExportedAudit(column.key ? getPathValue(report, column.key) : undefined),
    ))
  })
  headers.push(...exportedColumns.map(column => column.label))
  reports.forEach((report, index) => {
    body[index]?.push(...exportedColumns.map((column) => {
      const audit = column.key ? getPathValue(report, column.key) : undefined
      if (!isExportedAudit(audit))
        return ''
      if (audit.scoreDisplayMode === 'numeric')
        return typeof audit.numericValue === 'number' ? Math.round(audit.numericValue * 100) / 100 : ''
      return audit.score ?? ''
    }))
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
