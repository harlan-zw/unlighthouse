// UnlighthouseHooks — the stable HookMap surface.
// See v1.md §"Hookable event catalogue" (lines 939–974).
// Single tier. Adapter-private events live on each adapter's own `Hookable<T>`.

import { z } from 'zod'
import {
  AssertionResultSchema,
  ExtractedMetricsSchema,
  ScanIdSchema,
  ScanSummarySchema,
  StructuredErrorSchema,
  UrlSchema,
} from '../types/atoms'

// ────────────────────────────────────────────────────────────────────────────
// scan:* — orchestration lifecycle. Emitted by core.run(), not by adapters.
// ────────────────────────────────────────────────────────────────────────────

export const ScanCreatedPayloadSchema = z.object({
  scanId: ScanIdSchema,
  site: UrlSchema,
  startedAt: z.iso.datetime(),
})
export type ScanCreatedPayload = z.infer<typeof ScanCreatedPayloadSchema>

export const ScanStartedPayloadSchema = z.object({
  scanId: ScanIdSchema,
})
export type ScanStartedPayload = z.infer<typeof ScanStartedPayloadSchema>

export const ScanDiscoveringPayloadSchema = z.object({
  scanId: ScanIdSchema,
})
export type ScanDiscoveringPayload = z.infer<typeof ScanDiscoveringPayloadSchema>

export const ScanScanningPayloadSchema = z.object({
  scanId: ScanIdSchema,
  discovered: z.number().int().nonnegative(),
})
export type ScanScanningPayload = z.infer<typeof ScanScanningPayloadSchema>

export const ScanProgressPayloadSchema = z.object({
  scanId: ScanIdSchema,
  discovered: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type ScanProgressPayload = z.infer<typeof ScanProgressPayloadSchema>

export const ScanRouteCompletePayloadSchema = z.object({
  scanId: ScanIdSchema,
  url: UrlSchema,
  metrics: ExtractedMetricsSchema,
})
export type ScanRouteCompletePayload = z.infer<typeof ScanRouteCompletePayloadSchema>

export const ScanRouteFailedPayloadSchema = z.object({
  scanId: ScanIdSchema,
  url: UrlSchema,
  error: StructuredErrorSchema,
})
export type ScanRouteFailedPayload = z.infer<typeof ScanRouteFailedPayloadSchema>

export const ScanPausedPayloadSchema = z.object({ scanId: ScanIdSchema })
export type ScanPausedPayload = z.infer<typeof ScanPausedPayloadSchema>

export const ScanResumedPayloadSchema = z.object({ scanId: ScanIdSchema })
export type ScanResumedPayload = z.infer<typeof ScanResumedPayloadSchema>

export const ScanCancelledPayloadSchema = z.object({
  scanId: ScanIdSchema,
  reason: z.string().optional(),
})
export type ScanCancelledPayload = z.infer<typeof ScanCancelledPayloadSchema>

export const ScanCompletePayloadSchema = z.object({
  scanId: ScanIdSchema,
  summary: ScanSummarySchema,
})
export type ScanCompletePayload = z.infer<typeof ScanCompletePayloadSchema>

export const ScanErrorPayloadSchema = z.object({
  scanId: ScanIdSchema,
  error: StructuredErrorSchema,
})
export type ScanErrorPayload = z.infer<typeof ScanErrorPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// assert:* — assertion evaluation.
// ────────────────────────────────────────────────────────────────────────────

export const AssertPassedPayloadSchema = z.object({
  scanId: ScanIdSchema,
  result: AssertionResultSchema,
})
export type AssertPassedPayload = z.infer<typeof AssertPassedPayloadSchema>

export const AssertFailedPayloadSchema = z.object({
  scanId: ScanIdSchema,
  result: AssertionResultSchema,
})
export type AssertFailedPayload = z.infer<typeof AssertFailedPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// compare:* — cross-scan diff lifecycle.
// ────────────────────────────────────────────────────────────────────────────

export const CompareCompletePayloadSchema = z.object({
  baseScanId: ScanIdSchema,
  currentScanId: ScanIdSchema,
  regressions: z.number().int().nonnegative(),
  improvements: z.number().int().nonnegative(),
})
export type CompareCompletePayload = z.infer<typeof CompareCompletePayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// quota:* — rate-limit / quota events.
// ────────────────────────────────────────────────────────────────────────────

export const QuotaExceededPayloadSchema = z.object({
  bucket: z.string(),
  resetAt: z.iso.datetime().optional(),
})
export type QuotaExceededPayload = z.infer<typeof QuotaExceededPayloadSchema>

export const QuotaDepletedPayloadSchema = z.object({
  bucket: z.string(),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
})
export type QuotaDepletedPayload = z.infer<typeof QuotaDepletedPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// route:* — per-URL crawler/html events emitted by the legacy cluster engine.
// ────────────────────────────────────────────────────────────────────────────

export const RouteQueuedPayloadSchema = z.object({ scanId: ScanIdSchema, url: UrlSchema })
export type RouteQueuedPayload = z.infer<typeof RouteQueuedPayloadSchema>

export const RouteHtmlExtractedPayloadSchema = z.object({ scanId: ScanIdSchema, url: UrlSchema, payload: z.string() })
export type RouteHtmlExtractedPayload = z.infer<typeof RouteHtmlExtractedPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// audit:* — per-URL audit lifecycle. Used by quota / retry middleware.
// ────────────────────────────────────────────────────────────────────────────

export const AuditBeforePayloadSchema = z.object({
  scanId: ScanIdSchema,
  url: UrlSchema,
  auditor: z.string(),
  quotaBucket: z.string().optional(),
})
export type AuditBeforePayload = z.infer<typeof AuditBeforePayloadSchema>

export const AuditAfterPayloadSchema = z.object({
  scanId: ScanIdSchema,
  url: UrlSchema,
  auditor: z.string(),
  durationMs: z.number().nonnegative(),
  ok: z.boolean(),
})
export type AuditAfterPayload = z.infer<typeof AuditAfterPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// log — root-level log channel. Mirrors consola levels.
// ────────────────────────────────────────────────────────────────────────────

export const LogPayloadSchema = z.object({
  level: z.enum(['silent', 'fatal', 'error', 'warn', 'log', 'info', 'success', 'debug', 'trace', 'verbose']),
  message: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type LogPayload = z.infer<typeof LogPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// HookMap — schema map + Hookable<T> compatible TS map.
// ────────────────────────────────────────────────────────────────────────────

/** Zod-schema map. Used by `manifest`, MCP `events.subscribe`, NDJSON projection. */
export const HookSchemas = {
  'scan:created': ScanCreatedPayloadSchema,
  'scan:started': ScanStartedPayloadSchema,
  'scan:discovering': ScanDiscoveringPayloadSchema,
  'scan:scanning': ScanScanningPayloadSchema,
  'scan:progress': ScanProgressPayloadSchema,
  'scan:route-complete': ScanRouteCompletePayloadSchema,
  'scan:route-failed': ScanRouteFailedPayloadSchema,
  'scan:paused': ScanPausedPayloadSchema,
  'scan:resumed': ScanResumedPayloadSchema,
  'scan:cancelled': ScanCancelledPayloadSchema,
  'scan:complete': ScanCompletePayloadSchema,
  'scan:error': ScanErrorPayloadSchema,
  'route:queued': RouteQueuedPayloadSchema,
  'route:html-extracted': RouteHtmlExtractedPayloadSchema,
  'assert:passed': AssertPassedPayloadSchema,
  'assert:failed': AssertFailedPayloadSchema,
  'compare:complete': CompareCompletePayloadSchema,
  'quota:exceeded': QuotaExceededPayloadSchema,
  'quota:depleted': QuotaDepletedPayloadSchema,
  'audit:before': AuditBeforePayloadSchema,
  'audit:after': AuditAfterPayloadSchema,
  'log': LogPayloadSchema,
} as const

export type HookName = keyof typeof HookSchemas

/**
 * TS hook map compatible with `Hookable<HookMap>` from the `hookable` package.
 * Each handler receives the typed payload and returns void | Promise<void>.
 */
export type HookMap = {
  [K in HookName]: (payload: z.infer<(typeof HookSchemas)[K]>) => void | Promise<void>
}

/** Type alias mirroring the legacy `UnlighthouseHooks` name. */
export type UnlighthouseHooks = HookMap

/**
 * Discriminated union over every HookMap event. Emitted by `events.subscribe`,
 * persisted in `scans/{scanId}/events.jsonl.gz`, surfaced as NDJSON.
 *
 * Type-only union — we expose the schema variant separately (`HookEventUnion`)
 * for runtime validation.
 */
export type HookEvent = {
  [K in HookName]: { event: K, payload: z.infer<(typeof HookSchemas)[K]> }
}[HookName]

/** Runtime-validating discriminated union over HookMap. */
const hookEventVariants = Object.entries(HookSchemas).map(([name, payload]) =>
  z.object({ event: z.literal(name as HookName), payload }),
)
export const HookEventUnion = z.discriminatedUnion(
  'event',
  hookEventVariants as unknown as [
    (typeof hookEventVariants)[number],
    ...(typeof hookEventVariants)[number][],
  ],
)
