import type { Result } from 'lighthouse'
import type { UnlighthouseReport } from '../types'
import { extractInsights } from './extract'

export function normaliseLighthouseResult(result: Result): UnlighthouseReport {
  return {
    url: result.requestedUrl || result.finalUrl,
    fetchTime: result.fetchTime,
    insights: extractInsights(result),
    raw: result,
  }
}
