// pack.* commands — D-028. Built-in `pack-overview` powers scan.summary;
// other packs (cwv, images, js-bundle, a11y-quick-wins, seo-basics) run via
// pack.run. Output is content-addressable by (scanId, packName, packVersion).

import { z } from 'zod'
import { ScanId } from '../types/atoms'
import { defineCommand } from './define'

// ── pack.run ────────────────────────────────────────────────────────────────
export const PackRunCmd = defineCommand({
  name: 'pack.run',
  description: 'Execute a registered pack against a scan and return its typed report.',
  input: z.object({
    scanId: ScanId,
    pack: z.string().min(1),
    // Skip the cache and re-reconcile. Default false so agent calls hit cache
    // on the second visit; UI exposes this as a "Refresh" button.
    refresh: z.boolean().optional(),
  }),
  // Report shape is per-pack; the wire format wraps it generically so the
  // command registry stays single-signature. Consumers narrow `report` by
  // pulling the pack's `reportSchema` from contracts/packs.
  output: z.object({
    scanId: ScanId,
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
  description: 'List the packs registered on this host (built-in + community).',
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
