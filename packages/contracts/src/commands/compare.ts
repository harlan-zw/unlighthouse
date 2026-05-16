// compare.* commands — cross-scan diff + markdown output.
// See v1.md §"lhci.md integration audit" (lines 695–705).

import { z } from 'zod'
import { CategorySchema, DeviceSchema, MetricNameSchema, ScanIdSchema, UrlSchema } from '../types/atoms'
import { defineCommand } from './define'

const ThresholdKey = z.union([MetricNameSchema, CategorySchema])

const RouteDiffSchema = z.object({
  url: UrlSchema,
  /**
   * D-029: device dimension on the diff. Matrix scans produce one diff per
   * (url, device) pair so mobile and desktop regressions don't collapse into
   * each other. Single-device scans always carry 'mobile' (or whatever the
   * scan's primary device was).
   */
  device: DeviceSchema,
  metric: ThresholdKey,
  base: z.number().nullable(),
  current: z.number().nullable(),
  delta: z.number(),
  /** `true` when |delta| exceeds the configured threshold. */
  regressed: z.boolean(),
})
export type RouteDiff = z.infer<typeof RouteDiffSchema>

const CompareReportSchema = z.object({
  baseScanId: ScanIdSchema,
  currentScanId: ScanIdSchema,
  regressions: z.array(RouteDiffSchema),
  improvements: z.array(RouteDiffSchema),
  thresholds: z.partialRecord(ThresholdKey, z.number()),
})
export type CompareReport = z.infer<typeof CompareReportSchema>

// ── compare.run ─────────────────────────────────────────────────────────────
export const CompareRun = defineCommand({
  name: 'compare.run',
  description: 'Diff two scans against thresholds and return a structured report.',
  input: z.object({
    baseScanId: ScanIdSchema,
    currentScanId: ScanIdSchema,
    thresholds: z.partialRecord(ThresholdKey, z.number()).optional(),
  }),
  output: CompareReportSchema,
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── compare.markdown ────────────────────────────────────────────────────────
export const CompareMarkdown = defineCommand({
  name: 'compare.markdown',
  description: 'Render a Markdown PR comment from a comparison.',
  input: z.object({
    baseScanId: ScanIdSchema,
    currentScanId: ScanIdSchema,
    thresholds: z.partialRecord(ThresholdKey, z.number()).optional(),
    /** Optional title override. */
    title: z.string().optional(),
  }),
  output: z.object({
    markdown: z.string(),
    hasRegressions: z.boolean(),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── compare.findPrevious ────────────────────────────────────────────────────
export const CompareFindPrevious = defineCommand({
  name: 'compare.findPrevious',
  description: 'Find the most recent prior scan for a site / device / branch.',
  input: z.object({
    site: UrlSchema,
    device: DeviceSchema,
    branch: z.string().optional(),
    excludeScanId: ScanIdSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema.nullable(),
  }),
})

export { CompareReportSchema, RouteDiffSchema }
