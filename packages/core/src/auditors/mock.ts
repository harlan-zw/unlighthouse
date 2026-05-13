import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'

export interface MockAuditorOptions {
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

const MOCK_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: ['performance', 'accessibility', 'seo', 'best-practices'],
}

export function createMockProvider(): UnlighthouseProvider {
  return async (url: string, _options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500))

    const raw = {
      requestedUrl: url,
      finalUrl: url,
      fetchTime: new Date().toISOString(),
      categories: {
        'performance': {
          id: 'performance',
          title: 'Performance',
          score: 0.9,
        },
        'accessibility': {
          id: 'accessibility',
          title: 'Accessibility',
          score: 0.8,
        },
        'best-practices': {
          id: 'best-practices',
          title: 'Best Practices',
          score: 0.95,
        },
        'seo': {
          id: 'seo',
          title: 'SEO',
          score: 1,
        },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1200 },
        'cumulative-layout-shift': { numericValue: 0.01 },
        'first-contentful-paint': { numericValue: 1000 },
        'total-blocking-time': { numericValue: 100 },
        'speed-index': { numericValue: 1500 },
      },
    }

    return {
      url,
      fetchTime: raw.fetchTime,
      insights: {
        score: 0.91,
        categories: {
          'performance': { id: 'performance', title: 'Performance', score: 0.9 },
          'accessibility': { id: 'accessibility', title: 'Accessibility', score: 0.8 },
          'best-practices': { id: 'best-practices', title: 'Best Practices', score: 0.95 },
          'seo': { id: 'seo', title: 'SEO', score: 1 },
        },
        coreWebVitals: {
          lcp: 1200,
          cls: 0.01,
          fcp: 1000,
          tbt: 100,
          si: 1500,
        },
      },
      raw: raw as any,
    }
  }
}

export function createMockAuditor(_opts: MockAuditorOptions = {}): Auditor {
  const provider = createMockProvider()
  return {
    capabilities: MOCK_CAPABILITIES,
    async audit(url: string, _page?: Page, _opts?: AuditOpts): Promise<LighthouseReport> {
      const report = await provider(url)
      return report.raw as unknown as LighthouseReport
    },
  }
}
