// pack.* commands — D-028. Built-in `pack-overview` powers scan.summary;
// other packs (cwv, images, js-bundle, a11y-quick-wins, seo-basics) run via
// pack.run. Output is content-addressable by (scanId, packName, packVersion).

import { z } from 'zod'
import { DeviceSchema, ScanIdSchema } from '../types/atoms'
import { defineCommand } from './define'

// ── pack.run ────────────────────────────────────────────────────────────────
export const PackRunCmd = defineCommand({
  name: 'pack.run',
  description: 'Run a Lighthouse pack (cross-route analysis) against a finished scan. Returns a typed report — e.g. "images" lists routes with unoptimised LCP images, "cwv" returns p75 Core Web Vitals, "seo-basics" returns failing audits grouped by rule. Call pack.list first to discover available packs. Use scanId from history.list. For matrix scans, pass `device` to narrow the pack to one form-factor. Output is cached so re-running the same (scanId, pack, device) is free; pass refresh:true to bust.',
  input: z.object({
    scanId: ScanIdSchema,
    pack: z.string().min(1),
    // D-029: pack runs against rows for one device. Omitted = aggregate across
    // the matrix (every row in scan_routes is handed to the pack). Devices
    // produce observably different numbers so most packs will want a filter.
    device: DeviceSchema.optional(),
    // Skip the cache and re-reconcile. Default false so agent calls hit cache
    // on the second visit; UI exposes this as a "Refresh" button.
    refresh: z.boolean().optional(),
  }),
  // Report shape is per-pack; the wire format wraps it generically so the
  // command registry stays single-signature. Consumers narrow `report` by
  // pulling the pack's `reportSchema` from contracts/packs.
  output: z.object({
    scanId: ScanIdSchema,
    packName: z.string(),
    packVersion: z.string(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    report: z.unknown(),
    // `cache: 'hit'` means the report came from packRuns storage; `'miss'`
    // means it was just reconciled. Useful for "Last computed at …" UI hints
    // and for asserting cache behaviour in tests.
    cache: z.enum(['hit', 'miss']),
  }),
  exitCodes: { SCAN_NOT_FOUND: 64, PACK_NOT_FOUND: 66 },
})

// ── pack.list ───────────────────────────────────────────────────────────────
export const PackList = defineCommand({
  name: 'pack.list',
  description: 'List packs available for pack.run. Built-ins include "overview" (top-level scores), "cwv" (Core Web Vitals), "images" (lazy-load + sizing + alt), "js-bundle" (unused JS/CSS, third parties), "a11y-quick-wins" (top accessibility wins), "seo-basics" (indexability + meta). Returns name, description, version, and auditor count for each.',
  input: z.object({}),
  output: z.object({
    packs: z.array(z.object({
      name: z.string(),
      description: z.string(),
      version: z.string(),
      auditorCount: z.number().int().nonnegative(),
    })),
  }),
})
