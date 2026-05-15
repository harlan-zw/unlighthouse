// `overview` pack — the v1 entry point for agents and the layered-output tier 1.
// Powers `scan.summary`. Sub-1KB JSON: counts, score distribution, worst
// routes, and template groupings derived from the matcher tagged on each
// ExtractedMetrics row.
//
// Design notes:
// - Pure function of ScanRoute rows. No LHR/reconciled blob fetch.
// - Operates on per-device rows; the reconciler accepts a `device` filter
//   via PackReconcileCtx.routes (the caller pre-filters).
// - "Score" averages compute on rows that have a non-null performance score.
//   Missing scores are dropped, not coerced to 0 — better one honest cell
//   than a buried zero.
// - Worst-routes capped at 5, template groups capped at 5. Designed to stay
//   under the 1KB budget for the agent summary tier.

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts'
import type { Category, ScanRoute, Url } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Report shape ────────────────────────────────────────────────────────────

const CategorySchema = z.enum(['performance', 'accessibility', 'seo', 'best-practices'])

const OverviewReportSchema = z.object({
  scanId: z.string(),
  device: z.enum(['mobile', 'desktop']),
  routesScanned: z.number().int().nonnegative(),
  avgScore: z.number().nullable(),
  categoryAverages: z.partialRecord(CategorySchema, z.number().nullable()),
  distribution: z.object({
    passing: z.number().int().nonnegative(),
    needsWork: z.number().int().nonnegative(),
    poor: z.number().int().nonnegative(),
  }),
  worstRoutes: z.array(z.object({
    url: z.url(),
    score: z.number().nullable(),
    category: CategorySchema.nullable(),
  })).max(5),
  templateGroups: z.array(z.object({
    routeName: z.string().nullable(),
    routes: z.number().int().nonnegative(),
    avgScore: z.number().nullable(),
  })).max(5),
})

export type OverviewReport = z.infer<typeof OverviewReportSchema>

// ── Reconciler ──────────────────────────────────────────────────────────────

const SCORE_COLS = ['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices'] as const

function avg(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => typeof v === 'number')
  if (!present.length)
    return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

function rowAvg(row: ScanRoute): number | null {
  return avg(SCORE_COLS.map(c => row[c]))
}

// Pick the lowest-scoring category for a row — the actionable signal for an
// agent looking at "worst routes" ("perf is the problem here, not a11y").
function worstCategory(row: ScanRoute): Category | null {
  const candidates: Array<[Category, number | null | undefined]> = [
    ['performance', row.scorePerformance],
    ['accessibility', row.scoreAccessibility],
    ['seo', row.scoreSeo],
    ['best-practices', row.scoreBestPractices],
  ]
  let pick: { cat: Category, score: number } | null = null
  for (const [cat, score] of candidates) {
    if (typeof score !== 'number')
      continue
    if (!pick || score < pick.score)
      pick = { cat, score }
  }
  return pick?.cat ?? null
}

async function reconcile(ctx: PackReconcileCtx): Promise<OverviewReport> {
  const routes = ctx.routes
  // Device matrix (D-029) hasn't landed yet — ScanRoute has no `device`
  // column. When it does, this falls through to the first row's value;
  // until then the host passes the scan's stored device through the wire
  // and we surface the same constant in the report.
  const device = 'mobile' as const

  // Per-row average across all four categories. Used for both worstRoutes
  // and the headline avgScore.
  const rowAverages = new Map<string, number | null>()
  for (const r of routes)
    rowAverages.set(r.url, rowAvg(r))

  const validAverages = [...rowAverages.values()].filter((v): v is number => typeof v === 'number')
  const overallAvg = validAverages.length
    ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
    : null

  // Per-category averages across the whole scan.
  const categoryAverages: Partial<Record<Category, number | null>> = {
    performance: avg(routes.map(r => r.scorePerformance)),
    accessibility: avg(routes.map(r => r.scoreAccessibility)),
    seo: avg(routes.map(r => r.scoreSeo)),
    'best-practices': avg(routes.map(r => r.scoreBestPractices)),
  }

  // Lighthouse threshold buckets (≥ 0.9 passing, ≥ 0.5 needs-work, < 0.5 poor).
  // Rows with no score at all fall out — they aren't a passing/failing signal.
  const distribution = { passing: 0, needsWork: 0, poor: 0 }
  for (const score of rowAverages.values()) {
    if (typeof score !== 'number')
      continue
    if (score >= 0.9)
      distribution.passing++
    else if (score >= 0.5)
      distribution.needsWork++
    else
      distribution.poor++
  }

  // Top-5 worst routes by overall score (asc). Ties are broken by URL for
  // stable output across calls.
  const worstRoutes = routes
    .map(r => ({
      url: r.url as Url,
      score: rowAverages.get(r.url) ?? null,
      category: worstCategory(r),
    }))
    .filter(r => typeof r.score === 'number')
    .sort((a, b) => {
      if (a.score! !== b.score!)
        return a.score! - b.score!
      return a.url.localeCompare(b.url)
    })
    .slice(0, 5)

  // Template groups: bucket rows by routeName. Rows without a route-name
  // match collapse under `null`.
  const byTemplate = new Map<string | null, ScanRoute[]>()
  for (const r of routes) {
    const key = r.routeName ?? null
    const bucket = byTemplate.get(key)
    if (bucket)
      bucket.push(r)
    else
      byTemplate.set(key, [r])
  }
  const templateGroups = [...byTemplate.entries()]
    .map(([routeName, rows]) => ({
      routeName,
      routes: rows.length,
      avgScore: avg(rows.map(r => rowAverages.get(r.url) ?? null)),
    }))
    // Worst-scoring template groups first — the actionable surface.
    .sort((a, b) => {
      const sa = a.avgScore ?? Infinity
      const sb = b.avgScore ?? Infinity
      return sa - sb
    })
    .slice(0, 5)

  return {
    scanId: ctx.scanId,
    device,
    routesScanned: routes.length,
    avgScore: overallAvg,
    categoryAverages,
    distribution,
    worstRoutes,
    templateGroups,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const overviewPack: Pack<OverviewReport> = {
  name: 'overview',
  description: 'Sub-1KB scan summary: counts, score distribution, worst routes, template groups. Layered-output tier 1.',
  version: '1.0.0',
  // No specific auditor requirements — overview reads only what's already on
  // ScanRoute rows. The Lighthouse categories run by default on every scan.
  auditors: [],
  reconciler: reconcile,
  reportSchema: OverviewReportSchema,
}
