// Pack contract — the v1 unit of opinionated, multi-audit output.
// See v1.md §"Packs — curated multi-audit fix recipes" (D-028).
//
// A Pack picks a problem class (CWV, images, JS bundle, GEO), declares which
// auditors it needs, and joins their output into a typed report. Packs are
// composition on top of Auditor + Storage; they are NOT a port.
//
// Two layers in this file:
//   1. Wire-format schemas (Zod) — PackRun, AuditorRequirement. Cached, traversed
//      across HTTP / MCP / CLI. Storage-shaped.
//   2. Runtime interfaces (TypeScript) — Pack<T>, PackReconcileCtx. Live inside
//      a process; closures over storage / logger; not serialisable.

import { z } from 'zod'
import type { Logger } from '../ports/core'
import { ScanIdSchema } from '../types/atoms'
import type { Device, ScanId, ScanRoute } from '../types/atoms'

// ── Wire-format ────────────────────────────────────────────────────────────

export const AuditorRequirementSchema = z.object({
  kind: z.enum(['lh-category', 'lh-audit', 'custom']),
  id: z.string(),
  required: z.boolean(),
})
export type AuditorRequirement = z.infer<typeof AuditorRequirementSchema>

// Cached output of pack.run. Content-addressable by (scanId, name, version).
// Large reports spill to a blob; small ones stay inline.
export const PackRunSchema = z.object({
  scanId: ScanIdSchema,
  packName: z.string(),
  packVersion: z.string(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  report: z.unknown(),
  reportBlobKey: z.string().nullable(),
})
export type PackRun = z.infer<typeof PackRunSchema>

// ── Runtime interfaces ─────────────────────────────────────────────────────

/**
 * Read-only context handed to a Pack's reconciler. Storage access is via
 * lazy fetchers — packs that only need ExtractedMetrics rows never touch
 * the LHR/reconciled blob store.
 */
export interface PackReconcileCtx {
  scanId: ScanId
  routes: ScanRoute[]
  getReconciled?: (url: string, device: Device) => Promise<unknown>
  getLhr?: (url: string, device: Device) => Promise<unknown>
  logger?: Logger
}

/**
 * A Pack. Generic over its report shape; consumers infer `T` from
 * `reportSchema`. UI hint is optional — a host (UI) MAY render a tab/page
 * for the pack but the pack itself doesn't depend on a UI.
 */
export interface Pack<TReport = unknown> {
  name: string
  description: string
  version: string
  auditors?: AuditorRequirement[]
  reconciler: (ctx: PackReconcileCtx) => Promise<TReport>
  reportSchema: z.ZodType<TReport>
  ui?: {
    tab: string
    icon?: string
    component?: string
  }
}
