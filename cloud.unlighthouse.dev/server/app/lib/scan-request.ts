import type { LighthouseScanOptions, LighthouseScanResult } from '../services/lighthouse'
import { createError } from 'h3'

const VALID_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa']
const VALID_FORM_FACTORS = ['mobile', 'desktop'] as const
const VALID_THROTTLING = ['mobile3G', 'mobile4G', 'none'] as const

export function parseScanRequest(body: any): LighthouseScanOptions {
  if (!body || !body.url) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required field: url' })
  }

  if (body.categories && Array.isArray(body.categories)) {
    for (const category of body.categories) {
      if (!VALID_CATEGORIES.includes(category)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid category: ${category}. Valid categories are: ${VALID_CATEGORIES.join(', ')}`,
        })
      }
    }
  }

  if (body.formFactor && !VALID_FORM_FACTORS.includes(body.formFactor)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid formFactor. Must be "mobile" or "desktop"' })
  }

  if (body.throttling && !VALID_THROTTLING.includes(body.throttling)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid throttling. Must be "mobile3G", "mobile4G", or "none"' })
  }

  return {
    url: body.url,
    categories: body.categories,
    formFactor: body.formFactor,
    throttling: body.throttling,
    useCache: body.useCache !== false,
  }
}

export interface ScoreColumns {
  performanceScore: number
  accessibilityScore: number
  bestPracticesScore: number
  seoScore: number
}

export function projectScores(result: LighthouseScanResult): ScoreColumns {
  const score = (id: string) => Math.round((result.categories[id]?.score || 0) * 100)
  return {
    performanceScore: score('performance'),
    accessibilityScore: score('accessibility'),
    bestPracticesScore: score('best-practices'),
    seoScore: score('seo'),
  }
}
