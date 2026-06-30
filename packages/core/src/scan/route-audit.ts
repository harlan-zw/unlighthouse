// Per-URL audit/persist and scan finalize, extracted from core.ts's
// orchestrate() closure so they can be driven two ways:
//   1. The local crawler loop (core.ts) — one process audits every URL.
//   2. The Cloudflare ScanRunnerDO alarm loop — one audit per fresh worker
//      invocation, persisted incrementally, so a multi-URL scan survives past
//      a single invocation's waitUntil/CPU budget.
//
// Both call the SAME code here, so reconcile/blob/screenshot/pack logic never
// drifts between runtimes. These functions are dependency-injected and DO NOT
// mutate shared counters — `auditRoute` returns a result and the caller owns
// progress accounting (the DO tracks it in durable storage; correctness rests
// on the idempotent routes/blobs upserts, not on the counters).

import type {
  Logger,
  ScanId,
  ScanSummary,
  Storage,
  StructuredError,
} from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { HookMap } from '@unlighthouse/contracts/hooks'
import type { LighthouseResult } from '../report/types'
import { Buffer } from 'node:buffer'
import { ErrorCodes, toUnlighthouseError, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { ExtractedMetricsSchema, parseUrl } from '@unlighthouse/contracts/types/atoms'
import { createPackReconcileCtx } from '../packs/reconcile-context'
import { routeContractBlobKeyForReport } from '../report/route-contracts'

export type Device = 'mobile' | 'desktop'

/** Emit on whatever bus the caller owns (core's hook/iter queue, or the DO's ScanEventsDO forward). */
export type EmitFn = <K extends keyof HookMap>(
  event: K,
  payload: Parameters<HookMap[K]>[0],
) => Promise<void>

interface AuditorLike {
  // We never pass a page from this path; keeping the second parameter at
  // `undefined` stays assignable from real auditors without widening to any.
  audit: (url: string, page?: undefined, opts?: { signal?: AbortSignal, device?: Device }) => Promise<unknown>
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function toStructuredError(err: unknown): StructuredError {
  const normalized = toUnlighthouseError(err, { exposeInternal: true })
  return {
    code: normalized.code,
    message: normalized.message,
    statusCode: normalized.statusCode,
    category: normalized.category,
    retryable: normalized.retryable || undefined,
    suggestion: normalized.suggestion,
    docsUrl: normalized.docsUrl,
    details: normalized.details,
    cause: normalized.cause,
  }
}

async function urlHash(url: string): Promise<string> {
  return (await import('node:crypto')).hash('sha1', url, 'hex').slice(0, 16)
}

// Compute (scoreAverage, scoresByCategory) over a set of completed routes.
// Routes with `null` for a given category are skipped — Lighthouse leaves a
// category null when it failed to run (e.g. a 5xx response on that URL).
// Returns `scoreAverage: null` only when no route produced *any* score at all.
export function aggregateScores(routes: Array<{
  scorePerformance: number | null
  scoreAccessibility: number | null
  scoreSeo: number | null
  scoreBestPractices: number | null
  scoreAgenticBrowsing?: number | null
}>): Pick<ScanSummary, 'scoreAverage' | 'scoresByCategory'> {
  const cols = {
    'performance': 'scorePerformance',
    'accessibility': 'scoreAccessibility',
    'seo': 'scoreSeo',
    'best-practices': 'scoreBestPractices',
    'agentic-browsing': 'scoreAgenticBrowsing',
  } as const
  const byCategory: ScanSummary['scoresByCategory'] = {}
  const overall: number[] = []
  for (const [category, key] of Object.entries(cols) as Array<[keyof typeof cols, (typeof cols)[keyof typeof cols]]>) {
    const values = routes.map(r => r[key]).filter((v): v is number => v != null)
    if (values.length === 0)
      continue
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    byCategory[category] = avg
    overall.push(avg)
  }
  return {
    scoreAverage: overall.length === 0 ? null : overall.reduce((a, b) => a + b, 0) / overall.length,
    scoresByCategory: byCategory,
  }
}

export interface RouteAuditDeps {
  auditor: AuditorLike
  storage: Storage
  logger?: Logger
  /** Emit hook events (must carry scanId in the payload). */
  emit: EmitFn
}

export interface RouteAuditArgs {
  scanId: ScanId
  url: string
  device: Device
  signal?: AbortSignal
}

/**
 * Audit ONE url on ONE device, then persist: the routes row, the gzipped LHR
 * blob, the UI-shape + contract-shape reconciled report blobs, and the
 * full-page screenshot. Emits audit:before / scan:route-complete|failed /
 * audit:after. Returns `{ ok }` — never throws for an audit failure (it emits
 * the failure events and returns ok:false) and never mutates caller state.
 *
 * Idempotent: routes.putBatch upserts on (scanId,url,device) and every blob
 * key is deterministic (sha1(url)+device), so a retried call overwrites
 * cleanly rather than duplicating.
 */
export async function auditRoute(deps: RouteAuditDeps, args: RouteAuditArgs): Promise<{ ok: boolean, metrics?: unknown }> {
  const { auditor, storage, logger, emit } = deps
  const { scanId, url, device, signal } = args
  const parsedUrl = parseUrl(url)
  const auditStart = Date.now()
  logger?.debug?.(`Auditing ${url} [${device}]`)
  await emit('audit:before', { scanId, url: parsedUrl, auditor: 'auditor' })
  try {
    const report = await auditor.audit(url, undefined, { signal, device })
    const extracted = (report as { extracted?: unknown }).extracted
    const lhrGzip = (report as { lhrGzip?: Uint8Array }).lhrGzip
    const metrics = ExtractedMetricsSchema.parse(extracted ?? {
      url,
      path: new URL(url).pathname,
      routeName: null,
      scorePerformance: null,
      scoreAccessibility: null,
      scoreSeo: null,
      scoreBestPractices: null,
      scoreAgenticBrowsing: null,
      lcp: null,
      cls: null,
      inp: null,
      fcp: null,
      ttfb: null,
      tbt: null,
      si: null,
      lighthouseVersion: (report as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
      capturedAt: nowIso(),
    })

    if (lhrGzip) {
      // Mirror `routes.ts:blobKeyFor` derivation so the blob lines up with the
      // `lhrBlobKey` + `reportBlobKey` columns the row got. Device segment is
      // part of the filename so mobile + desktop results for the same URL don't
      // collide on the blob store.
      const hash = await urlHash(url)
      const lhrKey = `scans/${scanId}/lhr/${hash}-${device}.json.gz`
      const reportKey = `scans/${scanId}/reports/${hash}-${device}.json`
      const contractKey = routeContractBlobKeyForReport(reportKey)
      await storage.blobs.put(lhrKey, lhrGzip).catch((err) => {
        throw new UnlighthouseError({
          code: ErrorCodes.ROUTE_ARTIFACT_WRITE_FAILED,
          message: `Failed to store Lighthouse result for ${url} [${device}].`,
          cause: err,
        })
      })

      // Reconciled per-route report — UI-shaped, decoupled from LHR shape.
      // Uses the auditor's reconciled output if present (faster); otherwise
      // gunzips + reconciles here as a fallback.
      const reconciled = (report as { reconciled?: unknown }).reconciled
      let payload: unknown = reconciled
      let lhrCache: unknown = null
      const { gunzipSync } = await import('node:zlib')
      if (!payload) {
        try {
          const { reconcileRoute } = await import('../report/extract')
          lhrCache = JSON.parse(gunzipSync(lhrGzip).toString())
          payload = reconcileRoute({
            url,
            path: (metrics as { path?: string }).path ?? new URL(url).pathname,
            routeName: (metrics as { routeName?: string | null }).routeName ?? null,
            reportBlobKey: reportKey,
            lhr: lhrCache as LighthouseResult,
          })
        }
        catch (err) {
          logOperationalWarn('scan.reconciled_report_write_failed', err, {
            scanId,
            url,
            device,
            phase: 'reconcile',
          }, logger)
        }
      }
      if (payload) {
        const bytes = new TextEncoder().encode(JSON.stringify(payload))
        await storage.blobs.put(reportKey, bytes).catch((err) => {
          logOperationalWarn('scan.reconciled_report_write_failed', err, {
            scanId,
            url,
            device,
            reportKey,
          }, logger)
        })
      }

      // D-030 contract reconciled report. Reuse the LHR gunzip if we already
      // did one above. Packs that opt into `getReconciled` read this.
      if (!contractKey) {
        throw new UnlighthouseError({
          code: 'INTERNAL',
          message: `Failed to derive route contract key for ${url} [${device}].`,
        })
      }
      const { reconcileToContract } = await import('../report/extract')
      const lhr = lhrCache ?? JSON.parse(gunzipSync(lhrGzip).toString())
      const contract = reconcileToContract({ scanId, url, device, lhr: lhr as LighthouseResult })
      const contractBytes = new TextEncoder().encode(JSON.stringify(contract))
      await storage.blobs.put(contractKey, contractBytes).catch((err) => {
        throw new UnlighthouseError({
          code: ErrorCodes.ROUTE_ARTIFACT_WRITE_FAILED,
          message: `Failed to store route contract for ${url} [${device}].`,
          cause: err,
        })
      })

      await storage.routes.putBatch(scanId, device, [metrics])

      // Extract and store fullPageScreenshot as a separate blob.
      try {
        const lhrObj = lhrCache ?? JSON.parse(gunzipSync(lhrGzip).toString())
        const fpScreenshot = (lhrObj as { fullPageScreenshot?: { screenshot?: { data?: string } } })
          .fullPageScreenshot
          ?.screenshot
          ?.data
        if (fpScreenshot && typeof fpScreenshot === 'string') {
          const base64Data = fpScreenshot.replace(/^data:image\/\w+;base64,/, '')
          const screenshotKey = `scans/${scanId}/screenshots/${hash}-${device}.webp`
          const buf = Buffer.from(base64Data, 'base64')
          await storage.blobs.put(screenshotKey, new Uint8Array(buf)).catch((err) => {
            logOperationalWarn('scan.screenshot_write_failed', err, {
              scanId,
              url,
              device,
              screenshotKey,
            }, logger)
          })
        }
      }
      catch (err) {
        logOperationalWarn('scan.screenshot_extract_failed', err, { scanId, url, device }, logger)
      }
    }
    else {
      await storage.routes.putBatch(scanId, device, [metrics])
    }

    logger?.debug?.(`Audited ${url} [${device}] in ${Date.now() - auditStart}ms`)
    await emit('scan:route-complete', { scanId, url: parsedUrl, metrics })
    await emit('audit:after', {
      scanId,
      url: parsedUrl,
      auditor: 'auditor',
      durationMs: Date.now() - auditStart,
      ok: true,
    })
    return { ok: true, metrics }
  }
  catch (err) {
    const structured = toStructuredError(err)
    logger?.error?.(`Audit failed: ${url} [${device}] — ${structured.message || err}`)
    await emit('scan:route-failed', { scanId, url: parsedUrl, error: structured })
    await emit('audit:after', {
      scanId,
      url: parsedUrl,
      auditor: 'auditor',
      durationMs: Date.now() - auditStart,
      ok: false,
    })
    return { ok: false }
  }
}

export interface FinalizeDeps {
  storage: Storage
  config: UnlighthouseConfig
  logger?: Logger
  emit: EmitFn
}

export interface FinalizeArgs {
  scanId: ScanId
  devices: Device[]
  startedAtMs: number
  /** Progress counters. `scanned`/`failed` are advisory; `routes` (unique URLs discovered) drives the summary's route count. */
  stats: { discovered: number, scanned: number, failed: number }
}

/**
 * Aggregate scores across persisted routes, run all built-in packs, write the
 * terminal `complete` scan row, and emit `scan:complete`. Returns the summary.
 *
 * Idempotent: if the scan row is already `complete`, returns its existing
 * summary without re-running packs or re-emitting (guards against a retried
 * DO-alarm finalize).
 */
export async function finalizeScan(deps: FinalizeDeps, args: FinalizeArgs): Promise<ScanSummary> {
  const { storage, logger, emit } = deps
  const { scanId, devices, startedAtMs, stats } = args

  // Double-run guard — a retried finalize must not re-emit scan:complete or
  // re-run packs. (The local crawler path calls this exactly once with the row
  // still in a non-terminal state, so it always proceeds.)
  const existing = await storage.scans.get(scanId).catch((err) => {
    logOperationalWarn('scan.finalize_probe_failed', err, { scanId }, logger)
    return null
  })
  if (existing?.status === 'complete' && existing.summary)
    return existing.summary

  const scoredRoutes = stats.scanned > 0
    ? (await storage.routes.listForScan(scanId, { page: 1, pageSize: 10_000 })).items
    : []
  const summary: ScanSummary = {
    routes: stats.discovered,
    completed: stats.scanned,
    failed: stats.failed,
    ...aggregateScores(scoredRoutes),
    durationMs: Date.now() - startedAtMs,
    devices,
  }

  // Run all built-in packs automatically so reports are ready immediately.
  if (scoredRoutes.length > 0) {
    try {
      const { builtInPacks } = await import('../packs/index')
      const packCtx = createPackReconcileCtx({
        scanId,
        routes: scoredRoutes,
        blobs: storage.blobs,
        logger,
      })
      for (const [name, pack] of Object.entries(builtInPacks)) {
        try {
          const packStart = nowIso()
          const report = await pack.reconciler(packCtx)
          await storage.packRuns.put({
            scanId,
            packName: name,
            packVersion: pack.version,
            startedAt: packStart,
            completedAt: nowIso(),
            report,
            reportBlobKey: null,
          })
          logger?.debug?.(`Pack "${name}" completed for scan ${scanId}`)
        }
        catch (packErr) {
          logOperationalWarn('scan.pack_failed', packErr, { scanId, packName: name }, logger)
        }
      }
    }
    catch (err) {
      logOperationalWarn('scan.pack_system_failed', err, { scanId }, logger)
    }
  }

  logger?.info?.(`Scan ${scanId} complete — ${summary.completed} routes, ${summary.failed} failed, avg score: ${summary.scoreAverage?.toFixed(2) ?? 'N/A'}, ${(summary.durationMs / 1000).toFixed(1)}s`)
  await storage.scans.update(scanId, {
    status: 'complete',
    completedAt: nowIso(),
    summary,
  })
  await emit('scan:complete', { scanId, summary })
  return summary
}
