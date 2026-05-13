// route.* commands — operations against a single route within a scan.

import { z } from 'zod'
import { ExtractedMetrics, ScanId, ScanRoute, Url } from '../types/atoms'
import { defineCommand } from './define'

// ── route.get ───────────────────────────────────────────────────────────────
export const RouteGet = defineCommand({
  name: 'route.get',
  description: 'Get the full route row + LHR blob key for a single URL.',
  input: z.object({ scanId: ScanId, url: Url }),
  output: z.object({
    route: ScanRoute,
    /** The raw LHR JSON, fetched from `storage.blobs.get(route.lhrBlobKey)`. */
    lhr: z.unknown(),
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
})

// ── route.rescan ────────────────────────────────────────────────────────────
export const RouteRescan = defineCommand({
  name: 'route.rescan',
  description: 'Re-audit a single URL within an existing scan.',
  input: z.object({ scanId: ScanId, url: Url }),
  output: z.object({
    scanId: ScanId,
    url: Url,
    metrics: ExtractedMetrics,
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
})
