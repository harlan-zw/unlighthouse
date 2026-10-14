// Performance metrics across measured URLs, with source and coverage.
// Insight fixes use maximum single-route timing estimates, not additive totals.

import type { CwvFix, CwvReport, MetricSnapshot, Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { Device, PerformanceSource, ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { CwvReportSchema } from '@unlighthouse/contracts/packs'
import { isAuditEligible, isAuditPassed } from '@unlighthouse/contracts/types/atoms'
import { resolveDistinctPackRows } from './reconcile-context'

// ── Thresholds ──────────────────────────────────────────────────────────────
// web.dev/articles/vitals — last updated when this file was written.

const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  tbt: { good: 200, poor: 600 },
  si: { good: 3400, poor: 5800 },
} as const

type MetricKey = keyof typeof THRESHOLDS
const METRIC_KEYS: readonly MetricKey[] = ['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si']

function verdictFor(metric: MetricKey, value: number | null | undefined): 'good' | 'needsImprovement' | 'poor' | null {
  if (value == null)
    return null
  const t = THRESHOLDS[metric]
  if (value <= t.good)
    return 'good'
  if (value <= t.poor)
    return 'needsImprovement'
  return 'poor'
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function p75(values: number[]): number | null {
  if (!values.length)
    return null
  const sorted = [...values].sort((a, b) => a - b)
  // Linear interpolation at index (n-1) * 0.75 — same as the percentile
  // method PageSpeed Insights uses for CrUX rollup math.
  const pos = (sorted.length - 1) * 0.75
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const loVal = sorted[lo]
  const hiVal = sorted[hi]
  if (loVal === undefined || hiVal === undefined)
    return null
  if (lo === hi)
    return loVal
  const frac = pos - lo
  return loVal + (hiVal - loVal) * frac
}

function metricFromRow(row: ScanRoute, metric: MetricKey): number | null {
  const v = row[metric]
  return typeof v === 'number' ? v : null
}

function metricSnapshot(metric: MetricKey, routes: ScanRoute[], sourceByUrl: Map<string, PerformanceSource>): MetricSnapshot {
  const distribution = { good: 0, needsImprovement: 0, poor: 0, unknown: 0 }
  const values: Array<{ url: string, value: number }> = []
  for (const r of routes) {
    const v = metricFromRow(r, metric)
    if (v == null) {
      distribution.unknown++
      continue
    }
    values.push({ url: r.url, value: v })
    const verdict = verdictFor(metric, v)
    if (verdict)
      distribution[verdict]++
  }
  const numeric = values.map(v => v.value)
  const p = p75(numeric)
  const verdict = verdictFor(metric, p)
  const worstRoutes = [...values]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
  const sources = values.map(({ url }) => sourceByUrl.get(url) ?? { _tag: 'unavailable' as const, reason: 'Measurement source unavailable.' })
  const kinds = new Set(sources.map(source => source._tag))
  const source = kinds.size > 1 ? 'mixed' : sources[0]?._tag ?? 'unavailable'
  return { metric, p75: p, verdict, distribution, worstRoutes, source, sources, coverage: { eligible: routes.length, analysed: values.length, missing: routes.length - values.length } }
}

interface InsightAccum {
  insight: string
  title: string | null
  metric: MetricKey
  maxImpactMs: number
  routes: Set<string>
}

// Map an LHR-savings key to our metric key. CLS savings are in CLS-units
// (dimensionless) and we don't convert; consumer ignores them in the "ms"
// summary anyway. Only LCP/FCP/INP feed the ms-shaped fix list today.
const SAVINGS_TO_METRIC = {
  LCP: 'lcp',
  FCP: 'fcp',
  INP: 'inp',
} satisfies Record<string, MetricKey>

// Returns the per-audit metricSavings map for a route, preferring the
// reconciled blob (LH-version stable) over the raw LHR. Filters to insight
// audit ids up front so the caller doesn't have to. Returns null when neither
// substrate is available for the route.
interface SavingsMap { savings: NonNullable<ReconciledReport['audits'][string]['metricSavings']>, title: string | null }
async function readInsightAudits(
  url: string,
  device: Device,
  ctx: PackReconcileCtx,
): Promise<Map<string, SavingsMap> | null> {
  if (ctx.getReconciled) {
    const reconciled = await ctx.getReconciled(url, device).catch((err) => {
      ctx.logger?.debug?.(`cwv pack: failed to load reconciled report for ${url} [${device}]`, err)
      return null
    })
    if (reconciled?.audits) {
      const out = new Map<string, SavingsMap>()
      for (const [id, finding] of Object.entries(reconciled.audits)) {
        if (!id.endsWith('-insight') || !finding.metricSavings || !isAuditEligible(finding) || isAuditPassed(finding) || finding.scoreDisplayMode === 'error')
          continue
        out.set(id, { savings: finding.metricSavings, title: finding.title })
      }
      // The reconciled blob is the canonical substrate; if it exists for the
      // route, do NOT also walk the raw LHR (avoids double-counting).
      return out
    }
  }
  if (ctx.getLhr) {
    const lhr = await ctx.getLhr(url, device).catch((err) => {
      ctx.logger?.debug?.(`cwv pack: failed to load LHR for ${url} [${device}]`, err)
      return null
    })
    if (!lhr?.audits)
      return null
    const out = new Map<string, SavingsMap>()
    for (const [id, audit] of Object.entries(lhr.audits)) {
      if (!id.endsWith('-insight') || !audit.metricSavings || !isAuditEligible(audit) || isAuditPassed(audit) || audit.scoreDisplayMode === 'error')
        continue
      out.set(id, { savings: audit.metricSavings, title: audit.title ?? null })
    }
    return out
  }
  return null
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<CwvReport> {
  // Fold multi-device rows to one row per URL (mobile-preferred) so p75
  // distributions and route counts are over distinct URLs, not doubled across
  // the mobile + desktop rows of a device-matrix scan.
  const routes = resolveDistinctPackRows(ctx.routes)
  const sourceByUrl = new Map<string, PerformanceSource>()
  const reports = new Map<string, ReconciledReport | null>()
  for (const row of routes) {
    const report = ctx.getReconciled ? await ctx.getReconciled(row.url, row.device) : null
    reports.set(`${row.device}|${row.url}`, report)
    sourceByUrl.set(row.url, report?.provenance?.performanceSource ?? { _tag: 'unavailable', reason: 'Measurement source unavailable.' })
  }
  const readCtx = ctx.getReconciled ? { ...ctx, getReconciled: async (url: string, device: Device) => reports.get(`${device}|${url}`) ?? null } : ctx
  const metrics = METRIC_KEYS.map(k => metricSnapshot(k, routes, sourceByUrl))

  // Collect insight savings across routes. Prefer the reconciled report blob
  // (LH-version-stable, no raw-LHR parse) and fall back to getLhr only when
  // the reconciled blob is missing — typically old scans ingested before D-030.
  const topFixes: CwvFix[] = []
  if (ctx.getReconciled || ctx.getLhr) {
    const accum = new Map<string, InsightAccum>()
    for (const row of routes) {
      const audits = await readInsightAudits(row.url, row.device, readCtx)
      if (!audits)
        continue
      for (const [id, finding] of audits) {
        const { savings, title } = finding
        for (const [savingsKey, metric] of Object.entries(SAVINGS_TO_METRIC)) {
          const impact = savings[savingsKey as keyof typeof savings]
          if (typeof impact !== 'number' || impact <= 0)
            continue
          const key = `${id}|${metric}`
          const existing = accum.get(key)
          if (existing) {
            if (title && (!existing.title || title.localeCompare(existing.title) < 0))
              existing.title = title
            existing.routes.add(row.url)
            if (impact > existing.maxImpactMs)
              existing.maxImpactMs = impact
          }
          else {
            accum.set(key, {
              insight: id,
              title,
              metric,
              maxImpactMs: impact,
              routes: new Set([row.url]),
            })
          }
        }
      }
    }

    for (const f of accum.values()) {
      const arr = [...f.routes]
      topFixes.push({
        insight: f.insight,
        title: f.title ?? f.insight,
        maxImpactMs: f.maxImpactMs,
        metric: f.metric,
        routes: arr.slice(0, 5),
        routeCount: arr.length,
      })
    }
    topFixes.sort((a, b) => b.maxImpactMs - a.maxImpactMs)
    topFixes.length = Math.min(topFixes.length, 10)
  }

  return {
    scanId: ctx.scanId,
    routesAnalysed: routes.length,
    metrics,
    topFixes,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const cwvPack: Pack<CwvReport> = {
  name: 'cwv',
  description: 'Performance metrics across measured URLs, with source and coverage. Lighthouse insights retain native titles and metric savings.',
  version: '2.0.0',
  auditors: [
    // Lab metrics live on the ExtractedMetrics row — no auditor is strictly
    // required. The insight-level fixes only show up if the LHR has them.
    { kind: 'lh-audit', id: 'largest-contentful-paint', required: false },
    { kind: 'lh-audit', id: 'cumulative-layout-shift', required: false },
    { kind: 'lh-audit', id: 'interaction-to-next-paint', required: false },
  ],
  reconciler: reconcile,
  reportSchema: CwvReportSchema,
  ui: { tab: 'Performance metrics', icon: 'gauge' },
}
