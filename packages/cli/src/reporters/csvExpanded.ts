import type { UnlighthouseColumn } from '@unlighthouse/core'
import type { UnlighthouseRouteReport } from '../types'
import type { ReporterConfig } from './types'
import { get } from 'lodash-es'
import { csvSimpleFormat } from './csvSimple'

interface AuditValue {
  score?: number | null
  numericValue?: number
  scoreDisplayMode?: string
}

function readAudit(report: UnlighthouseRouteReport['report'], key: string): AuditValue | undefined {
  return get(report, key.replace('report.', ''))
}

function isExportedAudit(audit: AuditValue | undefined) {
  return Boolean(
    audit?.scoreDisplayMode
    && audit.scoreDisplayMode !== 'informative'
    && audit.scoreDisplayMode !== 'notApplicable',
  )
}

function formatExportedAudit(audit: AuditValue | undefined): string | number {
  if (!audit || !isExportedAudit(audit))
    return ''
  if (audit.scoreDisplayMode === 'binary')
    return audit.score ?? ''
  if (audit.scoreDisplayMode === 'numeric')
    return Math.round((audit.numericValue ?? Number.NaN) * 100) / 100
  return audit.score ?? ''
}

function categoryPresent(reports: UnlighthouseRouteReport[], key: string) {
  return reports.some(routeReport =>
    Object.values(routeReport.report.categories).some(category => (category as { key?: string }).key === key),
  )
}

export function reportCSVExpanded(reports: UnlighthouseRouteReport[], { columns }: ReporterConfig): string {
  const { headers, body } = csvSimpleFormat(reports)
  const exportedColumns: UnlighthouseColumn[] = []
  const columnGroups = columns ?? {}

  for (const key of Object.keys(columnGroups)) {
    if (key === 'overview' || !columnGroups[key] || !categoryPresent(reports, key))
      continue

    for (const column of columnGroups[key]) {
      const exportedSomewhere = reports.some(routeReport =>
        isExportedAudit(readAudit(routeReport.report, column.key)),
      )
      if (!exportedSomewhere)
        continue
      exportedColumns.push(column)
    }
  }

  headers.push(...exportedColumns.map(column => column.label))

  reports.forEach(({ report }, index) => {
    body[index].push(...exportedColumns.map(column =>
      formatExportedAudit(readAudit(report, column.key)),
    ))
  })

  return [
    headers.join(','),
    ...body.map(row => row.join(',')),
  ]
    .flat()
    .join('\n')
}
