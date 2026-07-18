import type { Logger, UnlighthouseOptions, UnlighthouseProvider, UnlighthouseReport } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, AuditorReport, Page } from '@unlighthouse/contracts/ports'
import { gzipSync } from '../util/gzip'
import { LIGHTHOUSE_DEFAULT_CATEGORIES } from './categories'
import { assertLighthouseResult, attachExtractedRouteData } from './lighthouse-report'

export interface MockAuditorOptions {
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

const MOCK_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: false,
  supportsThrottling: false,
  categories: [...LIGHTHOUSE_DEFAULT_CATEGORIES],
}

export function createMockProvider(): UnlighthouseProvider {
  return async (url: string, _options: UnlighthouseOptions = {}): Promise<UnlighthouseReport> => {
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Mock LHR shaped close enough to a real Lighthouse 13 result that the
    // downstream extract / reconcileToContract pipeline produces realistic
    // output during tests. Audits include `score` + `scoreDisplayMode` so
    // severity bucketing in reconcileToContract exercises every branch.
    const raw = {
      requestedUrl: url,
      finalUrl: url,
      fetchTime: new Date().toISOString(),
      lighthouseVersion: '13.4.0',
      userAgent: 'mock-auditor/1.0',
      categories: {
        'performance': {
          id: 'performance',
          title: 'Performance',
          score: 0.9,
          auditRefs: [
            { id: 'largest-contentful-paint', weight: 25 },
            { id: 'cumulative-layout-shift', weight: 25 },
            { id: 'first-contentful-paint', weight: 10 },
            { id: 'total-blocking-time', weight: 30 },
            { id: 'speed-index', weight: 10 },
            { id: 'render-blocking-insight', weight: 0 },
          ],
        },
        'accessibility': {
          id: 'accessibility',
          title: 'Accessibility',
          score: 0.8,
          auditRefs: [
            { id: 'image-alt', weight: 10 },
          ],
        },
        'best-practices': {
          id: 'best-practices',
          title: 'Best Practices',
          score: 0.95,
          auditRefs: [],
        },
        'seo': {
          id: 'seo',
          title: 'SEO',
          score: 1,
          auditRefs: [
            { id: 'is-crawlable', weight: 4 },
            { id: 'document-title', weight: 1 },
          ],
        },
        'agentic-browsing': {
          id: 'agentic-browsing',
          title: 'Agentic Browsing',
          score: 0.83,
          categoryScoreDisplayMode: 'fraction',
          auditRefs: [
            { id: 'agent-accessibility-tree', weight: 1 },
            { id: 'webmcp-registered-tools', weight: 1 },
            { id: 'webmcp-form-coverage', weight: 1 },
            { id: 'webmcp-schema-validity', weight: 1 },
            { id: 'cumulative-layout-shift', weight: 1 },
            { id: 'llms-txt', weight: 1 },
          ],
        },
      },
      audits: {
        'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'Largest Contentful Paint', description: 'LCP marks the time at which the largest text or image is painted.', score: 0.9, scoreDisplayMode: 'numeric', numericValue: 1200, displayValue: '1.2 s' },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', title: 'Cumulative Layout Shift', description: 'CLS measures visual stability.', score: 1, scoreDisplayMode: 'numeric', numericValue: 0.01, displayValue: '0.01' },
        'first-contentful-paint': { id: 'first-contentful-paint', title: 'First Contentful Paint', description: 'FCP marks the first paint.', score: 0.95, scoreDisplayMode: 'numeric', numericValue: 1000, displayValue: '1.0 s' },
        'total-blocking-time': { id: 'total-blocking-time', title: 'Total Blocking Time', description: 'TBT measures main-thread blocking.', score: 0.9, scoreDisplayMode: 'numeric', numericValue: 100, displayValue: '100 ms' },
        'speed-index': { id: 'speed-index', title: 'Speed Index', description: 'SI shows how quickly content is visually displayed.', score: 0.85, scoreDisplayMode: 'numeric', numericValue: 1500, displayValue: '1.5 s' },
        // Insight audit with metricSavings — exercises the enriched
        // ReconciledReport projection used by the cwv pack's topFixes loop.
        'render-blocking-insight': { id: 'render-blocking-insight', title: 'Eliminate render-blocking resources', description: 'Resources are blocking the first paint of your page.', score: 0.5, scoreDisplayMode: 'numeric', displayValue: 'Potential savings of 250 ms', metricSavings: { FCP: 250, LCP: 180 } },
        // Classic SEO audits — give seo-basics + title/description coverage.
        'is-crawlable': { id: 'is-crawlable', title: 'Page is not blocked from indexing', description: 'Search engines can index pages that aren\'t blocked.', score: 1, scoreDisplayMode: 'binary' },
        'document-title': { id: 'document-title', title: 'Document has a `<title>` element', description: 'The title gives screen reader users an overview of the page.', score: 0, scoreDisplayMode: 'binary' },
        // Accessibility audit — exercises a11y pass branch in mock.
        'image-alt': { id: 'image-alt', title: 'Image elements have `[alt]` attributes', description: 'Informative elements should aim for short, descriptive alt text.', score: null, scoreDisplayMode: 'notApplicable' },
        'agent-accessibility-tree': { id: 'agent-accessibility-tree', title: 'Accessibility tree is usable by agents', description: 'Interactive controls are discoverable in the accessibility tree.', score: 1, scoreDisplayMode: 'binary' },
        'webmcp-registered-tools': {
          id: 'webmcp-registered-tools',
          title: 'WebMCP tools registered',
          description: 'Lists the WebMCP tools registered at the time of analysis.',
          score: 1,
          scoreDisplayMode: 'informative',
          details: {
            type: 'list',
            items: [
              {
                type: 'table',
                title: 'Declarative Tools',
                items: [{ tool: 'contact', description: 'Send a contact request', inputSchema: '{}' }],
              },
            ],
          },
        },
        'webmcp-form-coverage': { id: 'webmcp-form-coverage', title: 'WebMCP form coverage', description: 'Forms have WebMCP annotations.', score: 1, scoreDisplayMode: 'notApplicable' },
        'webmcp-schema-validity': { id: 'webmcp-schema-validity', title: 'WebMCP schemas are valid', description: 'WebMCP schemas are valid.', score: 1, scoreDisplayMode: 'binary' },
        'llms-txt': { id: 'llms-txt', title: 'llms.txt follows recommendations', description: 'The llms.txt file follows recommendations.', score: 1, scoreDisplayMode: 'binary' },
      },
    } satisfies AuditorReport

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
          'agentic-browsing': { id: 'agentic-browsing', title: 'Agentic Browsing', score: 0.83, categoryScoreDisplayMode: 'fraction' },
        },
        coreWebVitals: {
          lcp: 1200,
          cls: 0.01,
          fcp: 1000,
          tbt: 100,
          si: 1500,
        },
      },
      // Gzipped raw LHR so core's ingest path writes the LHR + reconciled blobs.
      // Without this, the `if (lhrGzip)` branch never fires and downstream
      // pack tests can't read per-route audit data.
      lhrGzip: gzipSync(JSON.stringify(raw)),
      raw,
    }
  }
}

export function createMockAuditor(_opts: MockAuditorOptions = {}): Auditor {
  const provider = createMockProvider()
  return {
    capabilities: MOCK_CAPABILITIES,
    async audit(url: string, _page?: Page, opts?: AuditOpts): Promise<AuditorReport> {
      const report = await provider(url)
      // core.ts's auditWrapper reads `lhrGzip` + `extracted` off the return
      // value, so re-attach them alongside the raw LHR. Without this the
      // ingest path never writes the LHR / reconciled blobs in test runs.
      const out: AuditorReport = { ...assertLighthouseResult(report.raw) }
      // D-029: nudge the synthetic LHR per-device so tests can tell mobile
      // and desktop rows apart. Desktop gets better perf numbers — mirrors
      // the real-world pattern (less throttling = higher scores). lhrGzip
      // is regenerated so the LHR blob reflects the modified shape.
      const device = opts?.device ?? 'mobile'
      const isDesktop = device === 'desktop'
      if (isDesktop) {
        const audits = out.audits
        out.audits = {
          ...audits,
          'largest-contentful-paint': { ...(audits['largest-contentful-paint'] ?? {}), score: 1, numericValue: 600 },
          'first-contentful-paint': { ...(audits['first-contentful-paint'] ?? {}), score: 1, numericValue: 500 },
        }
        const categories = out.categories
        out.categories = {
          ...categories,
          performance: { ...(categories.performance ?? {}), score: 0.98 },
        }
      }
      return attachExtractedRouteData(out, url, 'mock')
    },
  }
}
