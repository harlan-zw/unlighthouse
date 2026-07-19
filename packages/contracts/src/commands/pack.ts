// pack.* commands — D-028. Built-in `pack-overview` powers scan.summary;
// other packs (cwv, images, js-bundle, a11y-quick-wins, seo-basics) run via
// pack.run. Output is content-addressable by (scanId, packName, packVersion).

import { z } from 'zod'
import { PackReportSchema } from '../packs/reports'
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
  // Report is the union of all built-in pack report schemas (PackReportSchema),
  // widened to accept any JSON-shaped object so a third-party/custom pack's
  // report (whose shape PackReportSchema knows nothing about) still validates.
  // `PackReportSchema` itself stays the strict built-in union — it's exported
  // separately for typed consumption (UI code that imports e.g. `SeoReport`).
  // Server-side output validation isn't a dev-only nicety here: the static/CI
  // client (`api/static-client.ts`) calls `cmd.output.parse()` and THROWS on
  // mismatch, so a strict union would hard-fail any custom pack in a static
  // report build, not just warn in the live server.
  output: z.object({
    scanId: ScanIdSchema,
    packName: z.string(),
    packVersion: z.string(),
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    // Preserve the report exactly as the owning pack emitted it. Built-in
    // report schemas overlap structurally (an empty js-bundle report also
    // satisfies ImagesReportSchema), so parsing the built-in union first can
    // select the wrong branch and strip fields that branch does not know.
    // The pack handler already validates against `pack.reportSchema`; this
    // transport boundary only needs to guarantee a JSON object.
    report: z.record(z.string(), z.unknown()).or(PackReportSchema),
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
  description: 'List packs available for pack.run. Built-ins include "overview" (top-level scores), "cwv" (Core Web Vitals), "images" (lazy-load + sizing + alt), "js-bundle" (unused JS/CSS, third parties), "a11y-quick-wins" (top accessibility wins), "seo-basics" (indexability + meta), "best-practices" (security headers, console errors, deprecated APIs). Returns name, description, version, auditor count, UI hint, and the pack\'s report JSON Schema for each.',
  input: z.object({}),
  output: z.object({
    packs: z.array(z.object({
      name: z.string(),
      description: z.string(),
      version: z.string(),
      auditorCount: z.number().int().nonnegative(),
      // D-045: every pack self-describes the tab it projects to.
      ui: z.object({
        tab: z.string(),
        icon: z.string().optional(),
      }),
      // D-045: `z.toJSONSchema(pack.reportSchema)` so the UI can decode a
      // pack's report (built-in or custom) without a hardcoded import. `null`
      // when a pack's reportSchema can't be converted (degrades gracefully
      // instead of failing the whole command over one bad custom pack).
      reportSchema: z.unknown().nullable(),
    })),
  }),
})
