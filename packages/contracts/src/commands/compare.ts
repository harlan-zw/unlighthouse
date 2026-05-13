// compare.* commands — cross-scan diff + markdown output.
// See v1.md §"lhci.md integration audit" (lines 695–705).

import { z } from 'zod'
import { Category, Device, MetricName, ScanId, Url } from '../types/atoms'
import { defineCommand } from './define'

const ThresholdKey = z.union([MetricName, Category])

const RouteDiff = z.object({
  url: Url,
  metric: ThresholdKey,
  base: z.number().nullable(),
  current: z.number().nullable(),
  delta: z.number(),
  /** `true` when |delta| exceeds the configured threshold. */
  regressed: z.boolean(),
})

const CompareReport = z.object({
  baseScanId: ScanId,
  currentScanId: ScanId,
  regressions: z.array(RouteDiff),
  improvements: z.array(RouteDiff),
  thresholds: z.partialRecord(ThresholdKey, z.number()),
})

// ── compare.run ─────────────────────────────────────────────────────────────
export const CompareRun = defineCommand({
  name: 'compare.run',
  description: 'Diff two scans against thresholds and return a structured report.',
  input: z.object({
    baseScanId: ScanId,
    currentScanId: ScanId,
    thresholds: z.partialRecord(ThresholdKey, z.number()).optional(),
  }),
  output: CompareReport,
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── compare.markdown ────────────────────────────────────────────────────────
export const CompareMarkdown = defineCommand({
  name: 'compare.markdown',
  description: 'Render a Markdown PR comment from a comparison.',
  input: z.object({
    baseScanId: ScanId,
    currentScanId: ScanId,
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
    site: Url,
    device: Device,
    branch: z.string().optional(),
    excludeScanId: ScanId.optional(),
  }),
  output: z.object({
    scanId: ScanId.nullable(),
  }),
})

export { CompareReport, RouteDiff }
