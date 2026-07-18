import type { UnlighthouseInsights } from '@unlighthouse/contracts'
import type { Result } from 'lighthouse'

export function extractInsights(result: Result): UnlighthouseInsights {
  const categories: UnlighthouseInsights['categories'] = {}
  let totalScore = 0
  let categoryCount = 0

  for (const [key, category] of Object.entries(result.categories)) {
    if (category.score !== null) {
      categories[key] = {
        id: key,
        title: category.title,
        score: category.score,
        categoryScoreDisplayMode: category.categoryScoreDisplayMode ?? 'gauge',
      }
      if (category.categoryScoreDisplayMode !== 'fraction') {
        totalScore += category.score
        categoryCount++
      }
    }
  }

  return {
    score: categoryCount > 0 ? totalScore / categoryCount : 0,
    categories,
    coreWebVitals: {
      lcp: result.audits['largest-contentful-paint']?.numericValue || 0,
      cls: result.audits['cumulative-layout-shift']?.numericValue || 0,
      fcp: result.audits['first-contentful-paint']?.numericValue || 0,
      tbt: result.audits['total-blocking-time']?.numericValue || 0,
      si: result.audits['speed-index']?.numericValue || 0,
    },
  }
}
