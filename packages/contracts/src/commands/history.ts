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
