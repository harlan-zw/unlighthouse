import { ofetch } from 'ofetch'
import type { UnlighthouseOptions, UnlighthouseReport, UnlighthouseProvider } from '../types'
import { extractInsights } from '../core/extract'

export interface PsiOptions {
  apiKey?: string
}

export const createPsiProvider = (providerOptions: PsiOptions = {}): UnlighthouseProvider => {
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
