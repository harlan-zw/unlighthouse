// history.* commands — cross-scan list / delete / rescan operations.

import { z } from 'zod'
import {
  DeviceSchema,
  PaginatedSchema,
  ScanIdSchema,
  ScanRouteSchema,
  ScanSchema,
  UrlSchema,
} from '../types/atoms'
import { defineCommand } from './define'

// ── history.get ─────────────────────────────────────────────────────────────
export const HistoryGet = defineCommand({
  name: 'history.get',
  description: 'Get full scan metadata + routes by scanId.',
  input: z.object({ scanId: ScanIdSchema }),
  output: ScanSchema.extend({ routes: z.array(ScanRouteSchema) }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

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

// ── history.delete ──────────────────────────────────────────────────────────
export const HistoryDelete = defineCommand({
  name: 'history.delete',
  description: 'Delete one or more past scans by id, or by site + retention.',
  input: z.union([
    z.object({ scanIds: z.array(ScanIdSchema).min(1) }),
    z.object({
      site: UrlSchema,
      keep: z.number().int().nonnegative().optional(),
      olderThan: z.iso.datetime().optional(),
    }),
  ]),
  output: z.object({
    deleted: z.array(ScanIdSchema),
  }),
  // Bulk destructive op. Agent has no business deleting user history.
  mcp: { hidden: true },
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
