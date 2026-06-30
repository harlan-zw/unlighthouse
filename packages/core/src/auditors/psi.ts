import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { ofetch } from 'ofetch'
import { extractInsights } from './extract'
import { attachExtractedRouteData } from './lighthouse-report'

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
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
    catch (e: unknown) {
      throw new Error(`PSI scan failed: ${errorMessage(e)}`)
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
      return attachExtractedRouteData(lhr, url)
    },
  }
}
