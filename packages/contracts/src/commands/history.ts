// history.* commands — cross-scan list / delete / rescan operations.

import { z } from 'zod'
import { Device, Paginated, Scan, ScanId, ScanRoute, Url } from '../types/atoms'
import { defineCommand } from './define'

// ── history.get ─────────────────────────────────────────────────────────────
export const HistoryGet = defineCommand({
  name: 'history.get',
  description: 'Get full scan metadata + routes by scanId.',
  input: z.object({ scanId: ScanId }),
  output: Scan.extend({ routes: z.array(ScanRoute) }),
  exitCodes: { SCAN_NOT_FOUND: 64 },
})

// ── history.list ────────────────────────────────────────────────────────────
export const HistoryList = defineCommand({
  name: 'history.list',
  description: 'List past scans, optionally filtered by site / device / branch.',
  input: z.object({
    site: Url.optional(),
    device: Device.optional(),
    branch: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(500).default(50),
  }),
  output: Paginated(Scan),
})

// ── history.delete ──────────────────────────────────────────────────────────
export const HistoryDelete = defineCommand({
  name: 'history.delete',
  description: 'Delete one or more past scans by id, or by site + retention.',
  input: z.union([
    z.object({ scanIds: z.array(ScanId).min(1) }),
    z.object({
      site: Url,
      keep: z.number().int().nonnegative().optional(),
      olderThan: z.iso.datetime().optional(),
    }),
  ]),
  output: z.object({
    deleted: z.array(ScanId),
  }),
})

// ── history.rescan ──────────────────────────────────────────────────────────
export const HistoryRescan = defineCommand({
  name: 'history.rescan',
  description: 'Start a new scan that mirrors the configuration of a past scan.',
  input: z.object({
    scanId: ScanId,
    overrideSite: Url.optional(),
  }),
  output: z.object({
    scanId: ScanId,
    site: Url,
    startedAt: z.iso.datetime(),
    /** The scan whose config was cloned. */
    sourceScanId: ScanId,
  }),
  exitCodes: { SCAN_NOT_FOUND: 64, ACTIVE_SCAN_CONFLICT: 9 },
})
