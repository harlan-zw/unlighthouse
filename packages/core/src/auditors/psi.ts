import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, AuditorReport, Page } from '@unlighthouse/contracts/ports'
import { ofetch } from 'ofetch'
import { PSI_SUPPORTED_CATEGORIES, unsupportedCategories } from './categories'
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
  categories: [...PSI_SUPPORTED_CATEGORIES],
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

export function createPsiProvider(providerOptions: PsiOptions = {}): UnlighthouseProvider {
  return async (url: string, options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    const apiKey = providerOptions.apiKey
    const strategy = options.emulatedFormFactor === 'desktop' ? 'desktop' : 'mobile'
    const requestedCategories = options.lighthouseFlags?.onlyCategories
      ?? options.lighthouseConfig?.settings?.onlyCategories
      ?? PSI_SUPPORTED_CATEGORIES
    const categories = Array.isArray(requestedCategories)
      ? requestedCategories.map(String)
      : [...PSI_SUPPORTED_CATEGORIES]
    const unsupported = unsupportedCategories(categories, PSI_SUPPORTED_CATEGORIES)
    if (unsupported.length) {
      throw new Error(`PSI does not support Lighthouse categories: ${unsupported.join(', ')}`)
    }

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
    async audit(url: string, _page?: Page, auditOpts: AuditOpts = {}): Promise<AuditorReport> {
      // Pass the per-route device through so PSI runs the mobile vs desktop
      // strategy (otherwise every audit ran PSI's default mobile emulation).
      const report = await provider(url, {
        emulatedFormFactor: auditOpts.device,
        lighthouseFlags: auditOpts.lighthouseFlags,
        lighthouseConfig: auditOpts.lighthouseConfig as UnlighthouseOptions['lighthouseConfig'],
      })
      const lhr = report.raw
      // PSI returns a raw LHR. Run the canonical extraction and attach
      // `.extracted` (the scored metrics row) + `.lhrGzip`, exactly like the
      // local + remote-lighthouse auditors — without this the persist path
      // (auditRoute) finds no `.extracted` and writes all-null scores.
      return attachExtractedRouteData(lhr, url, 'psi')
    },
  }
}
