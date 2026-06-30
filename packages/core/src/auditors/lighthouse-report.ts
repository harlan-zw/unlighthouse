import type { LighthouseReport } from '@unlighthouse/contracts/ports'
import type { LighthouseResult } from '../report/types'
import { ExtractedMetricsSchema } from '@unlighthouse/contracts/types/atoms'
import { extractRouteData } from '../report/extract'

function assertLighthouseResult(value: unknown): LighthouseResult {
  if (!value || typeof value !== 'object' || !('categories' in value) || !('audits' in value))
    throw new Error('Expected a Lighthouse result with categories and audits.')
  return value as LighthouseResult
}

export function attachExtractedRouteData(value: unknown, url: string): LighthouseReport {
  const lhr = assertLighthouseResult(value)
  const extracted = extractRouteData(lhr)
  const path = (() => {
    try {
      return new URL(url).pathname
    }
    catch (_err) {
      // Some auditor adapters pass non-absolute labels; preserve the original.
      return url
    }
  })()
  const metrics = ExtractedMetricsSchema.parse({
    url,
    path,
    routeName: null,
    scorePerformance: extracted.scores.performance,
    scoreAccessibility: extracted.scores.accessibility,
    scoreSeo: extracted.scores.seo,
    scoreBestPractices: extracted.scores.bestPractices,
    scoreAgenticBrowsing: extracted.scores.agenticBrowsing,
    lcp: extracted.lcp,
    cls: extracted.cls,
    inp: extracted.inp,
    fcp: extracted.fcp,
    ttfb: extracted.ttfb,
    tbt: extracted.tbt,
    si: extracted.si,
    lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
    capturedAt: new Date().toISOString(),
  })
  return Object.assign(lhr, { extracted: metrics, lhrGzip: extracted.lhrGzip }) as unknown as LighthouseReport
}
