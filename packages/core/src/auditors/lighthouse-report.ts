import type { AuditorReport } from '@unlighthouse/contracts/ports'
import { ExtractedMetricsSchema } from '@unlighthouse/contracts/types/atoms'
import { assertLighthouseResult, extractRouteData } from '../report/extract'

export { assertLighthouseResult }

export function attachExtractedRouteData(value: unknown, url: string, auditor?: string): AuditorReport {
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
    // D-040: the backend that produced this report. Stamped by the concrete
    // adapter (each passes its own name); routers/fallbacks pass it through.
    auditor: auditor ?? null,
    capturedAt: new Date().toISOString(),
  })
  return Object.assign(lhr, { extracted: metrics, lhrGzip: extracted.lhrGzip, auditor })
}
