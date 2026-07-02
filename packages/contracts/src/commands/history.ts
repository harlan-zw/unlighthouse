// history.* commands — cross-scan list / delete / rescan operations.

import { z } from 'zod'
import {
  DeviceSchema,
  PaginatedSchema,
  ScanIdSchema,
  ScanSchema,
  UrlSchema,
} from '../types/atoms'
import { defineCommand } from './define'

// ── history.list ────────────────────────────────────────────────────────────
export const HistoryList = defineCommand({
  name: 'history.list',
  description: 'List past scans, optionally filtered by site / device / branch.',
  input: z.object({
    site: UrlSchema.optional(),
    device: DeviceSchema.optional(),
    branch: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: PaginatedSchema(ScanSchema),
})

// ── history.rescan ──────────────────────────────────────────────────────────
export const HistoryRescan = defineCommand({
  name: 'history.rescan',
  description: 'Start a new scan that mirrors the configuration of a past scan.',
  input: z.object({
    scanId: ScanIdSchema,
    overrideSite: UrlSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    site: UrlSchema,
    startedAt: z.iso.datetime(),
    /** The scan whose config was cloned. */
    sourceScanId: ScanIdSchema,
  }),
  exitCodes: { SCAN_NOT_FOUND: 64, ACTIVE_SCAN_CONFLICT: 9 },
  // Agent can call scan.start with explicit config if a fresh scan is needed;
  // "rescan from history" is a UI convenience that conflicts with active scans.
  mcp: { hidden: true },
})

// ── history.prune ─────────────────────────────────────────────────────────
// D-044: enforce retention on demand. Agents / CI invoke it; the CLI host also
// runs it automatically after every scan when `retention` is configured. Reads
// `ctx.config.retention` merged with the (optional) per-call overrides below.
const PruneReasonSchema = z.enum(['count', 'age'])

const PruneScanDeletionSchema = z.object({
  scanId: ScanIdSchema,
  site: UrlSchema,
  startedAt: z.iso.datetime(),
  reasons: z.array(PruneReasonSchema),
  blobKeys: z.array(z.string()),
})

const PruneSiteResultSchema = z.object({
  site: UrlSchema,
  considered: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  protectedBaselines: z.number().int().nonnegative(),
  scanIds: z.array(ScanIdSchema),
})

export const HistoryPrune = defineCommand({
  name: 'history.prune',
  description: 'Prune old scans per the retention policy (oldest-first, per site). Supports dry-run.',
  input: z.object({
    /** Report what would be deleted without mutating storage. */
    dryRun: z.boolean().optional(),
    /** Override `config.retention.maxScansPerSite` for this call. */
    maxScansPerSite: z.coerce.number().int().positive().optional(),
    /** Override `config.retention.maxAgeDays` for this call. */
    maxAgeDays: z.coerce.number().int().positive().optional(),
    /** Override `config.retention.keepCiBaselines` for this call. */
    keepCiBaselines: z.boolean().optional(),
  }),
  output: z.object({
    dryRun: z.boolean(),
    totalScansDeleted: z.number().int().nonnegative(),
    totalBlobsDeleted: z.number().int().nonnegative(),
    deletions: z.array(PruneScanDeletionSchema),
    perSite: z.array(PruneSiteResultSchema),
  }),
})
