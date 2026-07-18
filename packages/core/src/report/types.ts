import type {
  LighthouseResult as ContractLighthouseResult,
  LighthouseAuditResult,
  LighthouseCategoryResult,
} from '@unlighthouse/contracts/ports'
import type { Assertion as CanonicalAssertion } from '@unlighthouse/contracts/types/atoms'
import { z } from 'zod'

// Lighthouse Result types (simplified)
export type LighthouseAudit = LighthouseAuditResult
export type LighthouseCategory = LighthouseCategoryResult
export type LighthouseResult = ContractLighthouseResult

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
export const MetricDiffSchema = z.object({
  name: z.string(),
  base: z.number(),
  current: z.number(),
  delta: z.number(),
  deltaPercent: z.number(),
  severity: z.enum(['regression', 'improvement', 'neutral']),
})
export type MetricDiff = z.infer<typeof MetricDiffSchema>

export interface ComparisonDiff {
  path: string
  url: string
  device: 'mobile' | 'desktop'
  metricDiffs: MetricDiff[]
  severity: 'regression' | 'improvement' | 'neutral'
}

export type { Assertion, AssertionResult } from '@unlighthouse/contracts/types/atoms'
export type AssertionType = CanonicalAssertion['type']
