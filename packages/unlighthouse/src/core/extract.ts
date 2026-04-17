import type { Result } from 'lighthouse'
import type { UnlighthouseInsights } from '../types'

export function extractInsights(result: Result): UnlighthouseInsights {
  const categories: Record<string, any> = {}
  let totalScore = 0
  let categoryCount = 0

  for (const [key, category] of Object.entries(result.categories)) {
    if (category.score !== null) {
      categories[key] = {
        id: key,
        title: category.title,
        score: category.score,
      }
      totalScore += category.score
      categoryCount++
    }
  }

  return {
    score: categoryCount > 0 ? totalScore / categoryCount : 0,
    categories,
    coreWebVitals: {
      lcp: (result.audits['largest-contentful-paint']?.numericValue as number) || 0,
      cls: (result.audits['cumulative-layout-shift']?.numericValue as number) || 0,
      fcp: (result.audits['first-contentful-paint']?.numericValue as number) || 0,
      tbt: (result.audits['total-blocking-time']?.numericValue as number) || 0,
      si: (result.audits['speed-index']?.numericValue as number) || 0,
    },
  }
}
