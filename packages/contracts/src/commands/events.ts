// events.* commands — streaming hook events (NDJSON / SSE / MCP chunks).
// See v1.md §"Command registry" lines 855–862 + §"Streaming" lines 896–902.

import { z } from 'zod'
import { HookEventUnion } from '../hooks'
import { ScanId } from '../types/atoms'
import { defineCommand } from './define'

// ── events.subscribe ────────────────────────────────────────────────────────
// Streaming. Returns AsyncIterable<HookEvent>.
export const EventsSubscribe = defineCommand({
  name: 'events.subscribe',
  description:
    'Subscribe to the typed HookMap event stream. Optionally scope to one scan or filter by event name.',
  streaming: true,
  input: z.object({
    scanId: ScanId.optional(),
    events: z.array(z.string()).optional(),
    /** Replay the last N events from the buffer before live events arrive. */
    replay: z.coerce.number().int().nonnegative().max(10_000).optional(),
  }),
  output: HookEventUnion,
  // Streaming tools over MCP stdio are projected through progress
  // notifications and haven't been exercised end-to-end. Until that path is
  // tested + documented, keep agents off it — scan.status polling is the
  // safe substitute for "is this scan done yet".
  mcp: { hidden: true },
})

// ── events.tail ─────────────────────────────────────────────────────────────
// Streaming. Tails persisted events from `scans/{scanId}/events.jsonl.gz`
// + live events for an in-flight scan.
export const EventsTail = defineCommand({
  name: 'events.tail',
  description:
    'Tail the persisted event log for a scan, optionally following live events while the scan is in flight.',
  streaming: true,
  input: z.object({
    scanId: ScanId,
    follow: z.boolean().optional(),
    events: z.array(z.string()).optional(),
  }),
  output: HookEventUnion,
  exitCodes: { SCAN_NOT_FOUND: 64 },
  mcp: { hidden: true },
})
