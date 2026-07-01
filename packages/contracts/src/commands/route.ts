// route.* commands — operations against a single route within a scan.

import { z } from 'zod'
import {
  AuditFindingSchema,
  CategorySchema,
  DeviceSchema,
  EntitySchema,
  ExtractedMetricsSchema,
  ScanIdSchema,
  ScanRouteSchema,
  StackPackSchema,
  UrlSchema,
} from '../types/atoms'
import { defineCommand } from './define'

// ── route.get ──────────────────────────────────────────────────────────────
export const RouteGet = defineCommand({
  name: 'route.get',
  description: 'Get the full route row + reconciled audit data for a single URL. Returns category scores, all audit findings, screenshot URL, and LHR provenance in one call.',
  input: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    device: DeviceSchema.optional(),
  }),
  output: z.object({
    route: ScanRouteSchema,
    // Categories carry both a pre-aggregated summary (counts) AND the
    // raw auditRefs so consumers can render per-category breakdowns
    // (failing list, passing list) without a second API call. Weights
    // come from the LHR auditRefs so a "what dropped the score most"
    // sort works.
    categories: z.array(z.object({
      id: z.string(),
      title: z.string(),
      score: z.number().nullable(),
      categoryScoreDisplayMode: z.enum(['gauge', 'fraction']).nullable(),
      auditCount: z.number().int(),
      passingCount: z.number().int(),
      failingCount: z.number().int(),
      auditRefs: z.array(z.object({
        id: z.string(),
        weight: z.number(),
      })),
    })),
    audits: z.record(z.string(), AuditFindingSchema),
    provenance: z.object({
      lighthouseVersion: z.string(),
      userAgent: z.string().nullable(),
      capturedAt: z.string(),
      benchmarkIndex: z.number().nullable(),
      timingTotal: z.number().nullable(),
      warnings: z.array(z.string()),
      runtimeError: z.object({ code: z.string(), message: z.string() }).nullable(),
    }),
    stackPacks: z.array(StackPackSchema).nullable(),
    entities: z.array(EntitySchema).nullable(),
    screenshotUrl: z.string().nullable(),
    // Devices this URL was audited on within the scan — so the UI can
    // show a device toggle without a second probe call. Mirrors the
    // legacy /dashboard/route response shape that route.get replaces.
    availableDevices: z.array(DeviceSchema),
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
})

// ── route.audits ───────────────────────────────────────────────────────────
export const RouteAudits = defineCommand({
  name: 'route.audits',
  description: 'Get all audit findings for a route, optionally filtered by category. Returns audit details with items so the frontend can drill into "why is this score low?".',
  input: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    device: DeviceSchema.optional(),
    category: CategorySchema.optional(),
  }),
  output: z.object({
    audits: z.array(z.object({
      id: z.string(),
      title: z.string().nullable(),
      description: z.string().nullable(),
      score: z.number().nullable(),
      severity: z.enum(['pass', 'warn', 'fail']),
      displayValue: z.string().nullable(),
      weight: z.number(),
      metricSavings: z.object({
        LCP: z.number().optional(),
        FCP: z.number().optional(),
        INP: z.number().optional(),
        CLS: z.number().optional(),
        TBT: z.number().optional(),
      }).nullable(),
      items: z.array(z.unknown()).nullable(),
    })),
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
    device: DeviceSchema.optional(),
  }),
  output: z.object({
    scanId: ScanIdSchema,
    url: UrlSchema,
    metrics: ExtractedMetricsSchema,
  }),
  exitCodes: { ROUTE_NOT_FOUND: 66, SCAN_NOT_FOUND: 64 },
  mcp: { hidden: true },
})
