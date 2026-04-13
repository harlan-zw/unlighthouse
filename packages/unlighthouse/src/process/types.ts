import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

// Lighthouse Result types (simplified)
export interface LighthouseAudit {
  score: number | null
  numericValue?: number
  displayValue?: string
  title?: string
  description?: string
  details?: {
    items?: any[]
    [key: string]: any
  }
}

export interface LighthouseResult {
  lighthouseVersion: string
  requestedUrl: string
  finalUrl: string
  categories: {
    'performance'?: { score: number | null }
    'accessibility'?: { score: number | null }
    'best-practices'?: { score: number | null }
    'seo'?: { score: number | null }
  }
  audits: Record<string, LighthouseAudit>
}

// Extracted route data after LHR processing
export interface ExtractedRoute {
  lcp: number | null
  cls: number | null // stored as x1000 int
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null
  scores: {
    performance: number | null
    accessibility: number | null
    bestPractices: number | null
    seo: number | null
  }
  audits: Record<string, LighthouseAudit>
  lhrGzip: Buffer
  screenshotNodes?: Record<string, { left: number, top: number, width: number, height: number }>
}

// HTML data from page inspection (uses HTMLExtractPayload from types.ts)
export type { HTMLExtractPayload } from '../types'

// Processor params
export interface ProcessorParams {
  db: BetterSQLite3Database
  scanId: string
  routes: Map<string, ExtractedRoute>
  htmlData?: Map<string, import('../types').HTMLExtractPayload>
  siteHost?: string
}

// Summary types for dashboard
export interface PerformanceSummary {
  avgLcp: number | null
  avgCls: number | null
  avgTbt: number | null
  avgFcp: number | null
  avgSi: number | null
  avgTtfb: number | null
  imageIssueCount: number
  thirdPartyCount: number
  totalWastedBytes: number
  totalWastedMs: number
}

export interface AccessibilitySummary {
  criticalCount: number
  seriousCount: number
  moderateCount: number
  minorCount: number
  totalIssues: number
  totalInstances: number
  wcagLevelA: number
  wcagLevelAA: number
  missingAltCount: number
  contrastIssueCount: number
}

export interface BestPracticesSummary {
  consoleErrorCount: number
  deprecatedApiCount: number
  vulnerableLibCount: number
  securityIssueCount: number
  outdatedLibCount: number
}

export interface SeoSummary {
  pagesWithTitle: number
  pagesWithDescription: number
  pagesWithCanonical: number
  pagesIndexable: number
  duplicateTitles: number
  duplicateDescriptions: number
  missingOgTags: number
  missingStructuredData: number
  genericLinkTextCount: number
}

// Comparison types
export interface MetricDiff {
  name: string
  base: number
  current: number
  delta: number
  deltaPercent: number
  severity: 'regression' | 'improvement' | 'neutral'
}

export interface ComparisonDiff {
  path: string
  url: string
  metricDiffs: MetricDiff[]
  severity: 'regression' | 'improvement' | 'neutral'
}

// Assertion types
export type AssertionType = 'minScore' | 'maxNumericValue' | 'maxRegression'

export interface Assertion {
  type: AssertionType
  /** Category for minScore: performance, accessibility, seo, best-practices */
  category?: string
  /** Metric for maxNumericValue: lcp, cls, tbt, fcp, si, ttfb */
  metric?: string
  /** Threshold value */
  value: number
  /** Fail if any single route fails, or only if the average fails */
  failOn?: 'any' | 'average'
}

export interface AssertionResult {
  assertion: Assertion
  passed: boolean
  actual: number
  /** Routes that failed this assertion (when failOn is 'any') */
  failingRoutes?: { url: string, path: string, value: number }[]
}
