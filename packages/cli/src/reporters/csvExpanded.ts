import { get } from 'lodash-es'
import { csvSimpleFormat } from './csvSimple'
import type { UnlighthouseRouteReport } from '../types'
import type { ReporterConfig } from './types'

export function reportCSVExpanded(reports: UnlighthouseRouteReport[], { columns }: ReporterConfig): string {
  const { headers, body } = csvSimpleFormat(reports)
  for (const k of Object.keys(columns)) {
    // already have overview
    if (k === 'overview')
      continue
    // check if k is within the reports
    if (!reports[0].report.categories.find(category => category.key === k))
      continue

    // add to headers
    headers.push(
      ...columns[k]
        .map(column => ({
          column,
          val: get(reports[0], column.key),
        }))
        .filter(({ val }) => val?.scoreDisplayMode && val.scoreDisplayMode !== 'informative' && val.scoreDisplayMode !== 'notApplicable')
        .map(({ column }) => column.label),
    )
  }

  reports.forEach(({ report }, i) => {
    for (const k of Object.keys(columns)) {
      // already have overview
      if (k === 'overview')
        continue
      // check if k is within the reports
      if (!reports[0].report.categories.find(category => category.key === k))
        continue

      // headers are good, now add body
      body[i].push(
        ...columns[k]
          .map(column => get(report, column.key.replace('report.', '')))
          .filter(val => val?.scoreDisplayMode && val.scoreDisplayMode !== 'informative' && val.scoreDisplayMode !== 'notApplicable')
          .map((val) => {
            if (val.scoreDisplayMode === 'binary')
              return val.score
            if (val.scoreDisplayMode === 'numeric')
              // round to 2 decimal places
              return Math.round(val.numericValue * 100) / 100
            return val.score
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
