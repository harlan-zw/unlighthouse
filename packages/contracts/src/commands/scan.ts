// scan.* commands — lifecycle of an in-flight scan.
// See v1.md §"Command registry" lines 800, 819–853.

import { z } from 'zod'
import {
  CategorySchema,
  DeviceSchema,
  MetricNameSchema,
  PaginatedSchema,
  ScanIdSchema,
  ScanRouteSchema,
  ScanStatusSchema,
  ScanSummarySchema,
  UrlSchema,
} from '../types/atoms'
import { defineCommand } from './define'

// ── scan.start ──────────────────────────────────────────────────────────────
// D-029: `device` accepts a single device or an array. One scan exercises N
// devices per URL; results land in ScanRoute keyed on (scanId, url, device).
// Single-device input is normalised to a one-element array downstream — the
// wire stays back-compatible.
export const ScanStart = defineCommand({
  name: 'scan.start',
  description: 'Start a new scan against a site. `device` accepts a single device or a list for a multi-device matrix scan.',
  input: z.object({
    site: UrlSchema,
    device: z.union([DeviceSchema, z.array(DeviceSchema).min(1)]).optional(),
    sampleSize: z.number().int().min(1).max(10).optional(),
    categories: z.array(CategorySchema).optional(),
    auditor: z.string().optional(),
    ciBuild: z
      .object({
        branch: z.string().optional(),
        hash: z.string().optional(),
        message: z.string().optional(),
      })
      .optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    site: UrlSchema,
    startedAt: z.iso.datetime(),
  }),
  exitCodes: { ACTIVE_SCAN_CONFLICT: 9, QUOTA_EXCEEDED: 78 },
})

// ── scan.status ─────────────────────────────────────────────────────────────
export const ScanStatusCmd = defineCommand({
  name: 'scan.status',
  description: 'Get the current status + stats of a scan.',
  input: z.object({ scanId: ScanIdSchema }),
  output: z.object({
    scanId: ScanIdSchema,
    status: ScanStatusSchema,
    discovered: z.number().int().nonnegative(),
    scanned: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── scan.cancel ─────────────────────────────────────────────────────────────
export const ScanCancel = defineCommand({
  name: 'scan.cancel',
  description: 'Cancel an in-flight scan.',
  input: z.object({
    scanId: ScanIdSchema,
    reason: z.string().optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    status: ScanStatusSchema,
    cancelledAt: z.iso.datetime(),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
  // Live-flow orchestration — only makes sense from the UI / CLI that owns the
  // running scan. An MCP client cancelling somebody else's session is hostile.
  mcp: { hidden: true },
})

// ── scan.pause ──────────────────────────────────────────────────────────────
export const ScanPause = defineCommand({
  name: 'scan.pause',
  description: 'Pause an in-flight scan (requires a pausable crawler).',
  input: z.object({ scanId: ScanIdSchema }),
  output: z.object({
    scanId: ScanIdSchema,
    status: ScanStatusSchema,
  }),
  exitCodes: { NOT_SUPPORTED: 65, SCAN_NOT_FOUND: 64 },
  mcp: { hidden: true },
})

// ── scan.resume ─────────────────────────────────────────────────────────────
export const ScanResume = defineCommand({
  name: 'scan.resume',
  description: 'Resume a paused scan.',
  input: z.object({ scanId: ScanIdSchema }),
  output: z.object({
    scanId: ScanIdSchema,
    status: ScanStatusSchema,
  }),
  exitCodes: { NOT_SUPPORTED: 65, SCAN_NOT_FOUND: 64 },
  mcp: { hidden: true },
})

// ── scan.delete ─────────────────────────────────────────────────────────────
export const ScanDelete = defineCommand({
  name: 'scan.delete',
  description: 'Delete a scan and all of its artifacts.',
  input: z.object({ scanId: ScanIdSchema }),
  output: z.object({
    scanId: ScanIdSchema,
    deleted: z.literal(true),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
  // Destructive + irreversible. Keep behind UI/CLI confirmation flows.
  mcp: { hidden: true },
})

// ── scan.meta ───────────────────────────────────────────────────────────────
export const ScanMetaCmd = defineCommand({
  name: 'scan.meta',
  description: 'Get the current scan\'s at-a-glance metadata.',
  input: z.object({ scanId: ScanIdSchema.optional() }),
  output: z.object({
    scanId: ScanIdSchema,
    site: UrlSchema,
    device: DeviceSchema,
    throttle: z.boolean(),
    startedAt: z.iso.datetime(),
    summary: ScanSummarySchema.nullable(),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── scan.current ────────────────────────────────────────────────────────────
export const ScanCurrent = defineCommand({
  name: 'scan.current',
  description: 'Return the current in-flight scanId, or null.',
  input: z.object({}),
  output: z.object({ scanId: ScanIdSchema.nullable() }),
  // "Current" is a UI/CLI session concept — there's no notion of a per-request
  // "current scan" in MCP. Agents pass scanIds explicitly via history.list.
  mcp: { hidden: true },
})

// ── scan.rescanAll ──────────────────────────────────────────────────────────
export const ScanRescanAll = defineCommand({
  name: 'scan.rescanAll',
  description: 'Full-site rescan within an existing scan (drops all routes + re-queues).',
  input: z.object({ scanId: ScanIdSchema }),
  output: z.object({
    scanId: ScanIdSchema,
    queued: z.number().int().nonnegative(),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64, ACTIVE_SCAN_CONFLICT: 9 },
  // Drops all routes for an existing scan. Destructive enough to keep
  // behind a deliberate UI / CLI flow.
  mcp: { hidden: true },
})

// ── scan.summary ────────────────────────────────────────────────────────────
// Layered agent output, tier 1 (D-028). Sub-1KB JSON: counts, score
// distribution, top-5 regressions, top template groups. Powered by the
// built-in `overview` pack on the host. Agent entry point.
export const ScanSummaryCmd = defineCommand({
  name: 'scan.summary',
  description: 'Agent entry point: a terse, template-grouped overview of a finished scan in sub-1KB JSON. Returns category averages (perf/a11y/seo/best-practices), passing/needs-work/poor distribution, the worst 5 routes by score, and template groups. Use this first to decide where to drill in — then call pack.run with a specific pack (e.g. "images", "cwv") for actionable findings, or query.routes / scan.results for raw per-route data.',
  input: z.object({
    scanId: ScanIdSchema,
    device: DeviceSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    site: UrlSchema,
    device: DeviceSchema,
    routesScanned: z.number().int().nonnegative(),
    // Site-wide scoring snapshot. `categories` keys are Lighthouse category ids.
    avgScore: z.number().nullable(),
    categoryAverages: z.partialRecord(CategorySchema, z.number().nullable()),
    // Bucketed by Lighthouse thresholds: passing ≥ 90, needs-work ≥ 50, poor < 50.
    distribution: z.object({
      passing: z.number().int().nonnegative(),
      needsWork: z.number().int().nonnegative(),
      poor: z.number().int().nonnegative(),
    }),
    // Top-N routes by lowest avg score. URL kept short; the table is for
    // orientation, not consumption — drill into query.routes for detail.
    worstRoutes: z.array(z.object({
      url: UrlSchema,
      score: z.number().nullable(),
      category: CategorySchema.nullable(),
    })),
    // Template grouping (from seeds/route-definitions matcher). Routes that
    // matched no template land under `routeName: null` which collapses to "/".
    templateGroups: z.array(z.object({
      routeName: z.string().nullable(),
      routes: z.number().int().nonnegative(),
      avgScore: z.number().nullable(),
    })),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── scan.results ────────────────────────────────────────────────────────────
// Load-bearing example (v1.md lines 840–853).
export const ScanResults = defineCommand({
  name: 'scan.results',
  description: 'List route results for a scan with filter + pagination. For matrix scans, pass `device` to narrow to mobile or desktop; omit to aggregate across the matrix.',
  input: z.object({
    scanId: ScanIdSchema,
    // D-029: filter to one device. Omitted = every (url, device) row.
    device: DeviceSchema.optional(),
    filter: z
      .object({
        minScore: z.partialRecord(CategorySchema, z.number()).optional(),
        maxMetric: z.partialRecord(MetricNameSchema, z.number()).optional(),
        urlPattern: z.string().optional(),
      })
      .optional(),
    sort: z
      .enum(['score-asc', 'score-desc', 'lcp-asc', 'lcp-desc', 'url-asc'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: PaginatedSchema(ScanRouteSchema),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})
