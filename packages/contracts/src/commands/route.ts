// route.* commands — operations against a single route within a scan.

import { z } from 'zod'
import { DeviceSchema, ExtractedMetricsSchema, ScanIdSchema, ScanRouteSchema, UrlSchema } from '../types/atoms'
import { defineCommand } from './define'

// ── route.get ───────────────────────────────────────────────────────────────
export const RouteGet = defineCommand({
  name: 'route.get',
  description: 'Get the full route row + LHR blob key for a single URL. For matrix scans, pass `device` to target a specific form-factor; defaults to the scan\'s primary device.',
  input: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    // D-029: matrix scans hold N rows per URL. Caller picks one with `device`;
    // omitted = use the scan's primary device (back-compat).
    device: DeviceSchema.optional(),
  }),
  output: z.object({
    route: ScanRouteSchema,
    /** The raw LHR JSON, fetched from `storage.blobs.get(route.lhrBlobKey)`. */
    lhr: z.unknown(),
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
})

// ── route.rescan ────────────────────────────────────────────────────────────
export const RouteRescan = defineCommand({
  name: 'route.rescan',
  description: 'Re-audit a single URL within an existing scan.',
  input: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    // D-029: which device row to re-audit. Defaults to the scan's primary
    // device. Re-audits one row at a time — fan-out across the matrix would
    // double-charge an active auditor without the caller asking for it.
    device: DeviceSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    metrics: ExtractedMetricsSchema,
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
  // Mutates an existing scan's data and needs a live auditor — UI flow only.
  mcp: { hidden: true },
})
