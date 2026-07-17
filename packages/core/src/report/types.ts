// Lighthouse Result types (simplified)
export interface LighthouseAudit {
  score: number | null
  numericValue?: number
  displayValue?: string
  title?: string
  description?: string
  details?: {
    items?: unknown[]
    [key: string]: unknown
  }
}

export interface LighthouseCategory {
  score: number | null
  title?: string
  id?: string
  categoryScoreDisplayMode?: 'gauge' | 'fraction'
  auditRefs?: Array<{ id: string, weight?: number }>
}

export interface LighthouseResult {
  lighthouseVersion: string
  requestedUrl: string
  finalUrl: string
  categories: {
    'performance'?: LighthouseCategory
    'accessibility'?: LighthouseCategory
    'best-practices'?: LighthouseCategory
    'seo'?: LighthouseCategory
    'agentic-browsing'?: LighthouseCategory
    [key: string]: LighthouseCategory | undefined
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
  inp: number | null
  scores: {
    performance: number | null
    accessibility: number | null
    bestPractices: number | null
    seo: number | null
    agenticBrowsing: number | null
  }
  audits: Record<string, LighthouseAudit>
  lhrGzip: Uint8Array
  screenshotNodes?: Record<string, { left: number, top: number, width: number, height: number }>
}

// HTML data from page inspection (uses HTMLExtractPayload from types.ts)
export type { HTMLExtractPayload } from '@unlighthouse/contracts'

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

export type { Assertion, AssertionResult, AssertionType } from '@unlighthouse/contracts'
