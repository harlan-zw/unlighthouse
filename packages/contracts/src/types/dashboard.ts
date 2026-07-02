// Wire shapes for dashboard endpoints. Shared between server and frontend
// so both sides agree on the contract. v2: dashboard endpoints read from
// pack reports, so these types reflect the pack-based output.
//
// CrUX field data used to have a bespoke wire shape here (`CruxData` /
// `CruxSeries` / `CruxHistoryEntry`), but the UI never actually received that
// shape at runtime — it was cast through `unknown` over the real `crux` pack
// output (`CruxReportSchema` in `packs/reports.ts`). Deleted with the D-045
// pack-tab rebuild (packages/ui ROADMAP.md); `CruxReportSchema` is the single
// source of truth for CrUX data now.

// Route detail (returned by route.get command and /dashboard/route endpoint)
export interface RouteDetail {
  route: {
    url: string
    path: string
    device: string
    scorePerformance: number | null
    scoreAccessibility: number | null
    scoreSeo: number | null
    scoreBestPractices: number | null
    scoreAgenticBrowsing: number | null
    lcp: number | null
    cls: number | null
    inp: number | null
    fcp: number | null
    ttfb: number | null
    tbt: number | null
    si: number | null
    lighthouseVersion: string
    screenshotBlobKey: string | null
  }
  categories: Array<{
    id: string
    title: string
    score: number | null
    auditCount: number
    passingCount: number
    failingCount: number
  }>
  audits: Record<string, {
    id: string
    score: number | null
    severity: 'pass' | 'warn' | 'fail'
    title: string | null
    description: string | null
    displayValue: string | null
    metricSavings: Record<string, number> | null
    items: Array<Record<string, unknown>> | null
  }>
  provenance: {
    lighthouseVersion: string
    userAgent: string | null
    capturedAt: string
    benchmarkIndex: number | null
    timingTotal: number | null
    warnings: string[]
    runtimeError: { code: string, message: string } | null
  }
  stackPacks: Array<{
    id: string
    title: string
    iconDataURL: string | null
    descriptions: Record<string, string>
  }> | null
  entities: Array<{
    name: string
    isFirstParty: boolean
    origins: string[]
  }> | null
  screenshotUrl: string | null
}

// Dashboard performance response (pack-based)
export interface PerformanceData {
  cwv: unknown
  insights: unknown
  routes: Array<{
    path: string
    score: number | null
    lcp: number | null
    cls: number | null
    tbt: number | null
    fcp: number | null
    si: number | null
    ttfb: number | null
  }>
}

// Dashboard accessibility response (pack-based)
export interface AccessibilityData {
  a11y: unknown
  routes: Array<{ path: string, score: number | null }>
}

// Dashboard best-practices response
export interface BestPracticesData {
  routes: Array<{ path: string, score: number | null }>
}

// Dashboard SEO response (pack-based)
export interface SeoData {
  seo: unknown
  routes: Array<{ path: string, score: number | null }>
}
