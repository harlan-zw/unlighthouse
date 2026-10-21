import type { UnlighthouseRouteReport } from '../types'

function escapeValueForCsv(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  return `"${value.replace(/"/g, '""')}"`
}

function formatScoreForCsv(score: number | null | undefined): string | number {
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.round(score * 100)
    : ''
}

interface CategoryCell {
  key: string
  title: string
  score: number | null
}

function categoriesOf(categories: UnlighthouseRouteReport['report']['categories']): CategoryCell[] {
  return Object.values(categories) as CategoryCell[]
}

export function csvSimpleFormat(reports: UnlighthouseRouteReport[]): { headers: string[], body: any } {
  const categoryColumns: { key: string, title: string }[] = []
  const seenCategoryKeys = new Set<string>()
  for (const { report } of reports) {
    for (const category of categoriesOf(report.categories)) {
      if (seenCategoryKeys.has(category.key))
        continue
      seenCategoryKeys.add(category.key)
      categoryColumns.push({ key: category.key, title: category.title })
    }
  }

  const headers = ['URL', 'Score', ...categoryColumns.map(category => category.title)]

  const body = reports
    .map(({ report, route }) => {
      const categories = categoriesOf(report.categories)
      return [
        route.path,
        formatScoreForCsv(report.score),
        ...categoryColumns.map((column) => {
          const category = categories.find(item => item.key === column.key)
          if (!category)
            return ''
          return formatScoreForCsv(category.score)
        }),
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
