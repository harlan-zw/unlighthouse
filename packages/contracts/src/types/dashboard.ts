// Wire shapes for dashboard endpoints. Shared between server and frontend
// so both sides agree on the contract. v2: dashboard endpoints read from
// pack reports, so these types reflect the pack-based output.

// CrUX data (field data from Chrome User Experience Report)
export interface CruxHistoryEntry {
  value: number
  time: number
  good?: number
  ni?: number
  poor?: number
}

export interface CruxSeries {
  lcp: CruxHistoryEntry[]
  inp: CruxHistoryEntry[]
  cls: CruxHistoryEntry[]
}

export interface CruxData {
  hostname: string | null
  phone: CruxSeries
  desktop: CruxSeries
}

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
