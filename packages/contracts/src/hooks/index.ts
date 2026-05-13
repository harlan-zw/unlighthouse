// UnlighthouseHooks — the stable HookMap surface.
// See v1.md §"Hookable event catalogue" (lines 939–974).
// Single tier. Adapter-private events live on each adapter's own `Hookable<T>`.

import { z } from 'zod'
import {
  AssertionResult,
  ExtractedMetrics,
  ScanId,
  ScanSummary,
  StructuredError,
  Url,
} from '../types/atoms'

// ────────────────────────────────────────────────────────────────────────────
// scan:* — orchestration lifecycle. Emitted by core.run(), not by adapters.
// ────────────────────────────────────────────────────────────────────────────

const ScanCreatedPayloadSchema = z.object({
  scanId: ScanId,
  site: Url,
  startedAt: z.iso.datetime(),
})
export type ScanCreatedPayload = z.infer<typeof ScanCreatedPayloadSchema>

const ScanStartedPayloadSchema = z.object({
  scanId: ScanId,
})
export type ScanStartedPayload = z.infer<typeof ScanStartedPayloadSchema>

const ScanDiscoveringPayloadSchema = z.object({
  scanId: ScanId,
})
export type ScanDiscoveringPayload = z.infer<typeof ScanDiscoveringPayloadSchema>

const ScanScanningPayloadSchema = z.object({
  scanId: ScanId,
  discovered: z.number().int().nonnegative(),
})
export type ScanScanningPayload = z.infer<typeof ScanScanningPayloadSchema>

const ScanProgressPayloadSchema = z.object({
  scanId: ScanId,
  discovered: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type ScanProgressPayload = z.infer<typeof ScanProgressPayloadSchema>

const ScanRouteCompletePayloadSchema = z.object({
  scanId: ScanId,
  url: Url,
  metrics: ExtractedMetrics,
})
export type ScanRouteCompletePayload = z.infer<typeof ScanRouteCompletePayloadSchema>

const ScanRouteFailedPayloadSchema = z.object({
  scanId: ScanId,
  url: Url,
  error: StructuredError,
})
export type ScanRouteFailedPayload = z.infer<typeof ScanRouteFailedPayloadSchema>

const ScanPausedPayloadSchema = z.object({ scanId: ScanId })
export type ScanPausedPayload = z.infer<typeof ScanPausedPayloadSchema>

const ScanResumedPayloadSchema = z.object({ scanId: ScanId })
export type ScanResumedPayload = z.infer<typeof ScanResumedPayloadSchema>

const ScanCancelledPayloadSchema = z.object({
  scanId: ScanId,
  reason: z.string().optional(),
})
export type ScanCancelledPayload = z.infer<typeof ScanCancelledPayloadSchema>

const ScanCompletePayloadSchema = z.object({
  scanId: ScanId,
  summary: ScanSummary,
})
export type ScanCompletePayload = z.infer<typeof ScanCompletePayloadSchema>

const ScanErrorPayloadSchema = z.object({
  scanId: ScanId,
  error: StructuredError,
})
export type ScanErrorPayload = z.infer<typeof ScanErrorPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// assert:* — assertion evaluation.
// ────────────────────────────────────────────────────────────────────────────

const AssertPassedPayloadSchema = z.object({
  scanId: ScanId,
  result: AssertionResult,
})
export type AssertPassedPayload = z.infer<typeof AssertPassedPayloadSchema>

const AssertFailedPayloadSchema = z.object({
  scanId: ScanId,
  result: AssertionResult,
})
export type AssertFailedPayload = z.infer<typeof AssertFailedPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// compare:* — cross-scan diff lifecycle.
// ────────────────────────────────────────────────────────────────────────────

const CompareCompletePayloadSchema = z.object({
  baseScanId: ScanId,
  currentScanId: ScanId,
  regressions: z.number().int().nonnegative(),
  improvements: z.number().int().nonnegative(),
})
export type CompareCompletePayload = z.infer<typeof CompareCompletePayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// quota:* — rate-limit / quota events.
// ────────────────────────────────────────────────────────────────────────────

const QuotaExceededPayloadSchema = z.object({
  bucket: z.string(),
  resetAt: z.iso.datetime().optional(),
})
export type QuotaExceededPayload = z.infer<typeof QuotaExceededPayloadSchema>

const QuotaDepletedPayloadSchema = z.object({
  bucket: z.string(),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
})
export type QuotaDepletedPayload = z.infer<typeof QuotaDepletedPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// audit:* — per-URL audit lifecycle. Used by quota / retry middleware.
// ────────────────────────────────────────────────────────────────────────────

const AuditBeforePayloadSchema = z.object({
  scanId: ScanId,
  url: Url,
  auditor: z.string(),
  quotaBucket: z.string().optional(),
})
export type AuditBeforePayload = z.infer<typeof AuditBeforePayloadSchema>

const AuditAfterPayloadSchema = z.object({
  scanId: ScanId,
  url: Url,
  auditor: z.string(),
  durationMs: z.number().nonnegative(),
  ok: z.boolean(),
})
export type AuditAfterPayload = z.infer<typeof AuditAfterPayloadSchema>

// ────────────────────────────────────────────────────────────────────────────
// log — root-level log channel. Mirrors consola levels.
// ────────────────────────────────────────────────────────────────────────────

const LogPayloadSchema = z.object({
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
  'assert:passed': AssertPassedPayloadSchema,
  'assert:failed': AssertFailedPayloadSchema,
  'compare:complete': CompareCompletePayloadSchema,
  'quota:exceeded': QuotaExceededPayloadSchema,
  'quota:depleted': QuotaDepletedPayloadSchema,
  'audit:before': AuditBeforePayloadSchema,
  'audit:after': AuditAfterPayloadSchema,
  'log': LogPayloadSchema,
} as const

export {
  AssertFailedPayloadSchema as AssertFailedPayload,
  AssertPassedPayloadSchema as AssertPassedPayload,
  AuditAfterPayloadSchema as AuditAfterPayload,
  AuditBeforePayloadSchema as AuditBeforePayload,
  CompareCompletePayloadSchema as CompareCompletePayload,
  LogPayloadSchema as LogPayload,
  QuotaDepletedPayloadSchema as QuotaDepletedPayload,
  QuotaExceededPayloadSchema as QuotaExceededPayload,
  ScanCancelledPayloadSchema as ScanCancelledPayload,
  ScanCompletePayloadSchema as ScanCompletePayload,
  ScanCreatedPayloadSchema as ScanCreatedPayload,
  ScanDiscoveringPayloadSchema as ScanDiscoveringPayload,
  ScanErrorPayloadSchema as ScanErrorPayload,
  ScanPausedPayloadSchema as ScanPausedPayload,
  ScanProgressPayloadSchema as ScanProgressPayload,
  ScanResumedPayloadSchema as ScanResumedPayload,
  ScanRouteCompletePayloadSchema as ScanRouteCompletePayload,
  ScanRouteFailedPayloadSchema as ScanRouteFailedPayload,
  ScanScanningPayloadSchema as ScanScanningPayload,
  ScanStartedPayloadSchema as ScanStartedPayload,
}

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
