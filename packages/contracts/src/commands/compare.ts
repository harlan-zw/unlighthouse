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

// Per-pack summary diff. `base` / `current` carry the raw pack reports
// for callers that want to drill in (they're `unknown` by design — each
// pack defines its own shape). `summary` lifts a handful of common
// numeric fields (findings.length, totalBytesSavable, severityCounts)
// out into a pack-agnostic shape so dashboards can render a one-line
// "pack X: 12 → 4 findings" row without parsing every pack's contract.
const PackSummarySchema = z.object({
  findings: z.number().int().nonnegative().nullable(),
  routesAnalysed: z.number().int().nonnegative().nullable(),
  totalBytesSavable: z.number().nonnegative().nullable(),
  critical: z.number().int().nonnegative().nullable(),
  serious: z.number().int().nonnegative().nullable(),
  moderate: z.number().int().nonnegative().nullable(),
  minor: z.number().int().nonnegative().nullable(),
})

const PackDiffSchema = z.object({
  packName: z.string(),
  base: z.unknown().nullable(),
  current: z.unknown().nullable(),
  baseSummary: PackSummarySchema.nullable(),
  currentSummary: PackSummarySchema.nullable(),
  hasChanges: z.boolean(),
})
export type PackDiff = z.infer<typeof PackDiffSchema>

const CompareReportSchema = z.object({
  baseScanId: ScanIdSchema,
  currentScanId: ScanIdSchema,
  summary: z.object({
    totalRegressions: z.number().int().nonnegative(),
    totalImprovements: z.number().int().nonnegative(),
    avgScoreDelta: z.number().nullable(),
  }),
  regressions: z.array(RouteDiffSchema),
  improvements: z.array(RouteDiffSchema),
  // Routes that exist on one side only. Reviewers care: a removed
  // route may be an unintended 404; an added route is new surface area
  // to eyeball. Carries one marker entry per (url, device) — the
  // contract's `current`/`base` nullability flags which side is the
  // ghost row.
  added: z.array(RouteDiffSchema),
  removed: z.array(RouteDiffSchema),
  thresholds: z.partialRecord(ThresholdKey, z.number()),
  packDiffs: z.array(PackDiffSchema),
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

// ── compare.detail ─────────────────────────────────────────────────────────
// Full route-by-route comparison for the UI. Unlike compare.run (which only
// returns threshold-exceeding diffs), this returns every matched route with
// all metrics side-by-side.

const CompareRouteMetricsSchema = z.object({
  scorePerformance: z.number().nullable(),
  scoreAccessibility: z.number().nullable(),
  scoreSeo: z.number().nullable(),
  scoreBestPractices: z.number().nullable(),
  lcp: z.number().nullable(),
  cls: z.number().nullable(),
  inp: z.number().nullable(),
  fcp: z.number().nullable(),
  ttfb: z.number().nullable(),
  tbt: z.number().nullable(),
  si: z.number().nullable(),
})

const CompareRouteRowSchema = z.object({
  url: UrlSchema,
  path: z.string(),
  device: DeviceSchema,
  base: CompareRouteMetricsSchema.nullable(),
  current: CompareRouteMetricsSchema.nullable(),
  deltas: CompareRouteMetricsSchema,
  status: z.enum(['unchanged', 'regressed', 'improved', 'added', 'removed']),
})
export type CompareRouteRow = z.infer<typeof CompareRouteRowSchema>

export const CompareDetail = defineCommand({
  name: 'compare.detail',
  description: 'Full route-by-route comparison of two scans with all metrics.',
  input: z.object({
    baseScanId: ScanIdSchema,
    currentScanId: ScanIdSchema,
    page: z.number().int().positive().optional().default(1),
    pageSize: z.number().int().positive().max(500).optional().default(100),
    sort: z.string().optional().default('delta-perf-desc'),
    filter: z.object({
      url: z.string().optional(),
      status: z.enum(['all', 'regressed', 'improved', 'changed', 'added', 'removed']).optional().default('all'),
      device: DeviceSchema.optional(),
    }).optional(),
    // Per-metric and per-category thresholds. Same shape as compare.run
    // so the dashboard threshold inputs map straight onto CI assertion
    // config. Absent → handler defaults (matches CI defaults so the
    // counts agree between the two paths).
    thresholds: z.partialRecord(ThresholdKey, z.number()).optional(),
  }),
  output: z.object({
    baseScanId: ScanIdSchema,
    currentScanId: ScanIdSchema,
    summary: z.object({
      totalRoutes: z.number().int().nonnegative(),
      changedRoutes: z.number().int().nonnegative(),
      regressedRoutes: z.number().int().nonnegative(),
      improvedRoutes: z.number().int().nonnegative(),
      addedRoutes: z.number().int().nonnegative(),
      removedRoutes: z.number().int().nonnegative(),
      avgScoreDelta: z.number().nullable(),
      categoryDeltas: z.array(z.object({
        category: z.string(),
        label: z.string(),
        base: z.number().nullable(),
        current: z.number().nullable(),
        delta: z.number().nullable(),
      })),
    }),
    routes: z.object({
      items: z.array(CompareRouteRowSchema),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
    }),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

export { CompareReportSchema, RouteDiffSchema }
