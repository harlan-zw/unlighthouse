// `cwv` pack — Core Web Vitals (LCP / CLS / INP) plus their lab-data
// cousins (FCP, TBT, SI, TTFB).
//
// Two layers of data in one report:
//   1. Sitewide verdict per metric: p75 across all routes, route counts in
//      good/needsImprovement/poor buckets. Google's "site passes CWV" rule
//      is p75 ≤ threshold; we surface the same number.
//   2. Top-N fix suggestions: every Lighthouse 12+ insight audit reports
//      `metricSavings.{LCP, FCP, INP, CLS}` — we sum those across routes,
//      sort by impact, and emit a fix list with the routes that ship them.
//
// Why this is a Pack and not "performance with a different tab":
//   - Joins lab metrics (ExtractedMetrics rows) with insight-level fixes
//     (raw LHR audits) — two storage tiers, one report.
//   - Computes p75 (not average) because that's the Google convention; no
//     individual Lighthouse audit returns it.
//   - Cross-route fix grouping: "render-blocking-insight saves 200ms FCP
//     on 18 routes" is one finding, not 18.

import type { Pack, PackReconcileCtx, ScanRoute } from '@unlighthouse/contracts'
import { z } from 'zod'

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

// ── Report shape ────────────────────────────────────────────────────────────

const MetricKeySchema = z.enum(['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'])
const VerdictSchema = z.enum(['good', 'needsImprovement', 'poor'])

const MetricSnapshotSchema = z.object({
  metric: MetricKeySchema,
  p75: z.number().nullable(),
  verdict: VerdictSchema.nullable(),
  distribution: z.object({
    good: z.number().int().nonnegative(),
    needsImprovement: z.number().int().nonnegative(),
    poor: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  // Up to 3 worst-scoring routes for the metric. URL kept short.
  worstRoutes: z.array(z.object({
    url: z.string(),
    value: z.number(),
  })).max(3),
})

const CwvFixSchema = z.object({
  insight: z.string(), // e.g. 'render-blocking-insight'
  title: z.string(),
  // Largest single-route impact reported by the LHR (we don't sum across
  // routes because impacts aren't additive — fixing render-blocking on
  // /blog doesn't shave time off /about).
  maxImpactMs: z.number(),
  metric: MetricKeySchema,
  // Routes that flagged this insight with non-zero savings, capped at 5.
  routes: z.array(z.string()).max(5),
  routeCount: z.number().int().nonnegative(),
})

const CwvReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  metrics: z.array(MetricSnapshotSchema),
  // Site-wide pass: every Core Web Vital (LCP, CLS, INP) p75 in `good`.
  // Mirrors the CrUX "Site passes" rule on PageSpeed Insights.
  passesCoreWebVitals: z.boolean(),
  // Top-N fix suggestions by impact. Capped at 10 for the wire payload.
  topFixes: z.array(CwvFixSchema).max(10),
})

export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>
export type CwvFix = z.infer<typeof CwvFixSchema>
export type CwvReport = z.infer<typeof CwvReportSchema>

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
  if (lo === hi)
    return sorted[lo]
  const frac = pos - lo
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac
}

function metricFromRow(row: ScanRoute, metric: MetricKey): number | null {
  const v = (row as Record<string, unknown>)[metric]
  return typeof v === 'number' ? v : null
}

function metricSnapshot(metric: MetricKey, routes: ScanRoute[]): MetricSnapshot {
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
  return { metric, p75: p, verdict, distribution, worstRoutes }
}

// Pretty insight title from its id — fallback when the LHR doesn't surface
// a `.title` field we'd want to consume directly.
const INSIGHT_TITLES: Record<string, string> = {
  'render-blocking-insight': 'Eliminate render-blocking resources',
  'lcp-discovery-insight': 'Make the LCP image discoverable',
  'lcp-breakdown-insight': 'Reduce LCP element render delay',
  'image-delivery-insight': 'Optimise image delivery',
  'document-latency-insight': 'Reduce document latency',
  'cache-insight': 'Set efficient cache lifetimes',
  'cls-culprits-insight': 'Stabilise elements that cause layout shifts',
  'dom-size-insight': 'Reduce DOM size for INP wins',
  'duplicated-javascript-insight': 'Remove duplicated JavaScript',
  'font-display-insight': 'Set `font-display: swap`',
  'forced-reflow-insight': 'Avoid forced reflows',
  'inp-breakdown-insight': 'Optimise INP breakdown',
  'legacy-javascript-insight': 'Drop legacy JavaScript',
  'modern-http-insight': 'Upgrade to a modern HTTP version',
  'network-dependency-tree-insight': 'Flatten the network dependency tree',
  'third-parties-insight': 'Reduce third-party impact',
  'viewport-insight': 'Set a viewport meta tag',
}

interface InsightAccum {
  insight: string
  metric: MetricKey
  maxImpactMs: number
  routes: Set<string>
}

type LhrLike = {
  audits?: Record<string, {
    title?: string
    metricSavings?: { FCP?: number, LCP?: number, INP?: number, CLS?: number }
  }>
}

// Map an LHR-savings key to our metric key. CLS savings are in CLS-units
// (dimensionless) and we don't convert; consumer ignores them in the "ms"
// summary anyway. Only LCP/FCP/INP feed the ms-shaped fix list today.
const SAVINGS_TO_METRIC: Record<string, MetricKey> = {
  LCP: 'lcp',
  FCP: 'fcp',
  INP: 'inp',
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<CwvReport> {
  const routes = ctx.routes
  const metrics = METRIC_KEYS.map(k => metricSnapshot(k, routes))

  // Site passes CWV iff all three core metrics' p75 lands in `good`.
  const core = ['lcp', 'cls', 'inp'] as const
  const passesCoreWebVitals = core.every((k) => {
    const m = metrics.find(x => x.metric === k)
    return m?.verdict === 'good'
  })

  // Collect insight savings across routes. Only walk if a getLhr exists —
  // a host running cwv without raw LHR access still gets the lab snapshot,
  // just no fix list.
  const topFixes: CwvFix[] = []
  if (ctx.getLhr) {
    const accum = new Map<string, InsightAccum>()
    for (const row of routes) {
      const lhr = await ctx.getLhr(row.url, 'mobile').catch(() => null) as LhrLike | null
      if (!lhr?.audits)
        continue
      for (const [id, audit] of Object.entries(lhr.audits)) {
        if (!id.endsWith('-insight'))
          continue
        const savings = audit.metricSavings
        if (!savings)
          continue
        for (const [savingsKey, metric] of Object.entries(SAVINGS_TO_METRIC)) {
          const impact = savings[savingsKey as keyof typeof savings]
          if (typeof impact !== 'number' || impact <= 0)
            continue
          const key = `${id}|${metric}`
          const existing = accum.get(key)
          if (existing) {
            existing.routes.add(row.url)
            if (impact > existing.maxImpactMs)
              existing.maxImpactMs = impact
          }
          else {
            accum.set(key, {
              insight: id,
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
        title: INSIGHT_TITLES[f.insight] ?? f.insight,
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
    passesCoreWebVitals,
    topFixes,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const cwvPack: Pack<CwvReport> = {
  name: 'cwv',
  description: 'Core Web Vitals: p75 LCP/CLS/INP per site, distribution, worst routes, top fix suggestions ranked by Lighthouse-reported impact.',
  version: '1.0.0',
  auditors: [
    // Lab metrics live on the ExtractedMetrics row — no auditor is strictly
    // required. The insight-level fixes only show up if the LHR has them.
    { kind: 'lh-audit', id: 'largest-contentful-paint', required: false },
    { kind: 'lh-audit', id: 'cumulative-layout-shift', required: false },
    { kind: 'lh-audit', id: 'interaction-to-next-paint', required: false },
  ],
  reconciler: reconcile,
  reportSchema: CwvReportSchema,
}
