import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { ofetch } from 'ofetch'
import { extractRouteData } from '../report/extract'
import { extractInsights } from './extract'

export interface PsiOptions {
  apiKey?: string
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

const PSI_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

export function createPsiProvider(providerOptions: PsiOptions = {}): UnlighthouseProvider {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    const apiKey = providerOptions.apiKey
    const strategy = options.emulatedFormFactor === 'desktop' ? 'desktop' : 'mobile'
    const categories = options.lighthouseConfig?.settings?.onlyCategories || ['performance', 'accessibility', 'best-practices', 'seo', 'pwa']

    try {
      const response = await ofetch('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
        query: {
          url,
          strategy,
          category: categories,
          key: apiKey,
        },
      })

      const lhr = response.lighthouseResult

      return {
        url: lhr.finalUrl || lhr.requestedUrl || url,
        fetchTime: lhr.fetchTime,
        insights: extractInsights(lhr),
        raw: lhr,
        artifacts: lhr.artifacts,
      }
    }
    catch (e: any) {
      throw new Error(`PSI scan failed: ${e.message || 'Unknown error'}`)
    }
  }
}

export function createPsiAuditor(opts: PsiOptions = {}): Auditor {
  const provider = createPsiProvider(opts)
  return {
    capabilities: PSI_CAPABILITIES,
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<LighthouseReport> {
      // Pass the per-route device through so PSI runs the mobile vs desktop
      // strategy (otherwise every audit ran PSI's default mobile emulation).
      const report = await provider(url, { emulatedFormFactor: auditOpts.device })
      const lhr = report.raw
      // PSI returns a raw LHR. Run the canonical extraction and attach
      // `.extracted` (the scored metrics row) + `.lhrGzip`, exactly like the
      // local + remote-lighthouse auditors — without this the persist path
      // (auditRoute) finds no `.extracted` and writes all-null scores.
      const extracted = extractRouteData(lhr as never)
      const path = (() => {
        try {
          return new URL(url).pathname
        }
        catch {
          return url
        }
      })()
      const metrics = {
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
        lighthouseVersion: (lhr as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
        capturedAt: new Date().toISOString(),
      }
      return Object.assign(
        lhr as unknown as LighthouseReport,
        { extracted: metrics, lhrGzip: extracted.lhrGzip },
      )
    },
  }
}
