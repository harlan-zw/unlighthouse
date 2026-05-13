// Wire shapes returned by /api/dashboard/* endpoints. Shared so client and
// server agree on the contract; drift becomes a typecheck failure.

export interface DashboardSummary {
  performance: { avgScore: number, issues: number }
  accessibility: { avgScore: number, issues: number }
  bestPractices: { avgScore: number, issues: number }
  seo: { avgScore: number, issues: number }
  totalRoutes: number
}

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

export interface PerformanceData {
  issues: Array<{
    id: string
    url: string
    type: string
    issueType: string
    issueSubtype: string | null
    wastedBytes: number
    wastedMs: number
    pages: string[]
  }>
  thirdParty: Array<{
    entity: string
    totalTbt: number
    avgTbt: number
    pageCount: number
    pages: string[]
  }>
  lcpElements: Array<{
    selector: string
    elementType: string
    avgLcp: number
    pageCount: number
    pages: string[]
  }>
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

export interface AccessibilityData {
  issues: Array<{
    auditId: string
    title: string
    description: string
    severity: string
    instanceCount: number
    pageCount: number
    wcagCriteria: string[]
    pages: string[]
  }>
  elements: Array<{
    selector: string
    snippet?: string
    auditId: string
    severity: string
    issueDescription?: string
    foregroundColor?: string
    backgroundColor?: string
    contrastRatio?: number
    requiredRatio?: number
    boundingRect?: { left: number, top: number, width: number, height: number } | null
    screenshotPage?: string | null
    pageCount: number
    pages: string[]
  }>
  missingAltImages: Array<{
    url: string
    thumbnail: string | null
    isDecorative: boolean
    pageCount: number
    pages: string[]
  }>
  routes: Array<{ path: string, score: number | null }>
}

export interface BestPracticesData {
  securityIssues: Array<{
    type: string
    severity: string
    description: string
    pageCount: number
    details: Record<string, any>
    pages: string[]
  }>
  libraries: Array<{
    name: string
    version: string
    status: string
    pageCount: number
    pages: string[]
  }>
  vulnerableLibraries: Array<{
    name: string
    version: string
    highestSeverity: string
    cves: string[]
    pageCount: number
    pages: string[]
  }>
  deprecatedApis: Array<{
    api: string
    source: string
    pageCount: number
    pages: string[]
  }>
  consoleErrors: Array<{
    message: string
    source: string
    instanceCount: number
    pageCount: number
    pages: string[]
  }>
  routes: Array<{ path: string, score: number | null }>
}

export interface SeoData {
  meta: Array<{
    path: string
    title: string | null
    titleLength: number | null
    description: string | null
    descriptionLength: number | null
    canonical: string | null
    ogTitle: string | null
    ogDescription: string | null
    ogImage: string | null
    hasOgTags: boolean
    twitterCard: string | null
    twitterTitle: string | null
    twitterDescription: string | null
    twitterImage: string | null
    hasTwitterTags: boolean
    structuredDataTypes: string[]
    hreflangTags: string[]
    isIndexable: boolean
  }>
  duplicates: Array<{
    type: string
    value: string
    pageCount: number
    pages: string[]
  }>
  canonicalChains: Array<{
    chain: string
    isLoop: boolean
    pages: string[]
  }>
  linkTextIssues: Array<{
    text: string
    instanceCount: number
    pageCount: number
    pages: string[]
  }>
  tapTargetIssues: Array<{
    path: string
    elementCount: number
    elements: Array<{ selector: string, size: string }>
  }>
  routes: Array<{ path: string, score: number | null }>
}
