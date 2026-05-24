// compare.* handlers — operate on the v2 Storage port (ScanRoute rows).

import type {
  Category,
  CommandOutput,
  CompareDetail,
  CompareFindPrevious,
  CompareMarkdown,
  CompareRun,
  MetricName,
  ScanRoute,
} from '@unlighthouse/contracts'
import type { Handler, HandlerCtx } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

const DEFAULT_THRESHOLDS: Record<string, number> = {
  'lcp': 500,
  'cls': 0.1,
  'tbt': 200,
  'fcp': 300,
  'si': 500,
  'ttfb': 200,
  'inp': 200,
  'performance': 0.05,
  'accessibility': 0.05,
  'best-practices': 0.05,
  'seo': 0.05,
}

const CATEGORY_COL: Record<string, keyof ScanRoute> = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
}

function valueOf(route: ScanRoute, metric: MetricName | Category): number | null {
  const cat = CATEGORY_COL[metric as string]
  if (cat)
    return (route as unknown as Record<string, number | null>)[cat as string]
  return (route as unknown as Record<string, number | null>)[metric as string] ?? null
}

interface Diff {
  url: string
  // D-029: matrix scans key diffs on (url, device) so mobile and desktop
  // regressions don't collapse. Mirrors the RouteDiff contract atom.
  device: ScanRoute['device']
  metric: MetricName | Category
  base: number | null
  current: number | null
  delta: number
  regressed: boolean
}

// D-029: row key for cross-scan join. baseByUrl was URL-only before; matrix
// scans have multiple rows per URL so the URL alone overwrites every prior
// device's row when building the map. (url, device) restores 1:1 lookup.
function rowKey(r: ScanRoute): string {
  return `${r.url}|${r.device}`
}

async function loadRoutes(ctx: HandlerCtx, scanId: string): Promise<ScanRoute[]> {
  const scan = await ctx.storage.scans.get(scanId as unknown as never)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })
  const res = await ctx.storage.routes.listForScan(scanId as unknown as never, { page: 1, pageSize: 10_000 })
  return res.items
}

async function runCompare(ctx: HandlerCtx, baseScanId: string, currentScanId: string, thresholds?: Record<string, number>) {
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) }
  const [baseRoutes, currentRoutes] = await Promise.all([
    loadRoutes(ctx, baseScanId),
    loadRoutes(ctx, currentScanId),
  ])
  const baseByKey = new Map(baseRoutes.map(r => [rowKey(r), r]))

  const metrics: (MetricName | Category)[] = [
    'lcp',
    'cls',
    'inp',
    'fcp',
    'ttfb',
    'tbt',
    'si',
    'performance',
    'accessibility',
    'seo',
    'best-practices',
  ]
  const isScore = (m: MetricName | Category) => !!CATEGORY_COL[m as string]

  const regressions: Diff[] = []
  const improvements: Diff[] = []

  for (const current of currentRoutes) {
    // Match base to current on (url, device). A matrix scan compared against
    // a single-device base will still find pairs for the overlapping device
    // and skip the rest — no false regressions from missing base rows.
    const base = baseByKey.get(rowKey(current))
    if (!base)
      continue
    for (const metric of metrics) {
      const baseVal = valueOf(base, metric)
      const currentVal = valueOf(current, metric)
      if (baseVal == null || currentVal == null)
        continue
      const delta = currentVal - baseVal
      const threshold = resolvedThresholds[metric as string] ?? 0
      const score = isScore(metric)
      const regressed = score ? -delta > threshold : delta > threshold
      const improved = score ? delta > threshold : -delta > threshold
      if (regressed || improved) {
        const diff: Diff = {
          url: current.url,
          device: current.device,
          metric,
          base: baseVal,
          current: currentVal,
          delta,
          regressed,
        }
        ;(regressed ? regressions : improvements).push(diff)
      }
    }
  }

  return {
    baseScanId,
    currentScanId,
    regressions,
    improvements,
    thresholds: resolvedThresholds,
    summary: null as {
      totalRegressions: number
      totalImprovements: number
      avgScoreDelta: number | null
      categoryDeltas: Array<{ category: string, label: string, base: number | null, current: number | null, delta: number | null }>
    } | null,
    packDiffs: [] as Array<{ packName: string, hasChanges: boolean }>,
  }
}

export const compareRun: Handler<typeof CompareRun> = {
  command: {} as typeof CompareRun,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)

    const [baseScan, currentScan] = await Promise.all([
      ctx.storage.scans.get(input.baseScanId as unknown as never),
      ctx.storage.scans.get(input.currentScanId as unknown as never),
    ])

    const baseAvg = baseScan?.summary?.scoreAverage ?? null
    const currentAvg = currentScan?.summary?.scoreAverage ?? null

    const baseScores = baseScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined
    const currentScores = currentScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined

    const categoryDeltas = CATEGORY_ORDER.map((category) => {
      const base = baseScores?.[category] ?? null
      const current = currentScores?.[category] ?? null
      const delta = base != null && current != null ? current - base : null
      return { category, label: CATEGORY_LABEL[category], base, current, delta }
    })

    report.summary = {
      totalRegressions: report.regressions.length,
      totalImprovements: report.improvements.length,
      avgScoreDelta: baseAvg != null && currentAvg != null ? currentAvg - baseAvg : null,
      categoryDeltas,
    }

    report.packDiffs = []

    await emitCompareComplete(ctx, input.baseScanId, input.currentScanId, report.regressions.length, report.improvements.length)
    return report as unknown as CommandOutput<typeof CompareRun>
  },
}

// ── compare.detail ─────────────────────────────────────────────────────────

const METRIC_KEYS = ['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices', 'lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'] as const
const SCORE_KEYS = new Set(['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices'])

function extractMetrics(route: ScanRoute) {
  const m: Record<string, number | null> = {}
  for (const k of METRIC_KEYS)
    m[k] = (route as unknown as Record<string, number | null>)[k] ?? null
  return m
}

function computeDeltas(base: Record<string, number | null> | null, current: Record<string, number | null> | null) {
  const d: Record<string, number | null> = {}
  for (const k of METRIC_KEYS)
    d[k] = base?.[k] != null && current?.[k] != null ? current[k]! - base[k]! : null
  return d
}

function classifyRow(deltas: Record<string, number | null>, base: Record<string, number | null> | null, current: Record<string, number | null> | null): 'unchanged' | 'regressed' | 'improved' | 'added' | 'removed' {
  if (!base) return 'added'
  if (!current) return 'removed'
  let hasRegression = false
  let hasImprovement = false
  for (const k of METRIC_KEYS) {
    const d = deltas[k]
    if (d == null) continue
    const isScore = SCORE_KEYS.has(k)
    if (isScore ? d < -0.01 : d > 50) hasRegression = true
    if (isScore ? d > 0.01 : d < -50) hasImprovement = true
  }
  if (hasRegression) return 'regressed'
  if (hasImprovement) return 'improved'
  return 'unchanged'
}

interface DetailRow {
  url: string
  path: string
  device: string
  base: Record<string, number | null> | null
  current: Record<string, number | null> | null
  deltas: Record<string, number | null>
  status: 'unchanged' | 'regressed' | 'improved' | 'added' | 'removed'
}

export const compareDetail: Handler<typeof CompareDetail> = {
  command: {} as typeof CompareDetail,
  async run(input, ctx) {
    const [baseRoutes, currentRoutes] = await Promise.all([
      loadRoutes(ctx, input.baseScanId),
      loadRoutes(ctx, input.currentScanId),
    ])

    const baseByKey = new Map(baseRoutes.map(r => [rowKey(r), r]))
    const currentByKey = new Map(currentRoutes.map(r => [rowKey(r), r]))
    const allKeys = new Set([...baseByKey.keys(), ...currentByKey.keys()])

    const allRows: DetailRow[] = []
    for (const key of allKeys) {
      const baseRoute = baseByKey.get(key)
      const currentRoute = currentByKey.get(key)
      const route = currentRoute ?? baseRoute!
      const baseMetrics = baseRoute ? extractMetrics(baseRoute) : null
      const currentMetrics = currentRoute ? extractMetrics(currentRoute) : null
      const deltas = computeDeltas(baseMetrics, currentMetrics)
      const status = classifyRow(deltas, baseMetrics, currentMetrics)
      allRows.push({
        url: route.url,
        path: route.path,
        device: route.device,
        base: baseMetrics,
        current: currentMetrics,
        deltas,
        status,
      })
    }

    const filter = input.filter ?? {}
    let filtered = allRows
    if (filter.url)
      filtered = filtered.filter(r => r.url.includes(filter.url!) || r.path.includes(filter.url!))
    if (filter.status && filter.status !== 'all') {
      if (filter.status === 'changed')
        filtered = filtered.filter(r => r.status !== 'unchanged')
      else
        filtered = filtered.filter(r => r.status === filter.status)
    }

    const sort = input.sort || 'delta-perf-desc'
    const [sortType, sortKey, sortDir] = sort.split('-')
    if (sortType === 'delta') {
      const metricKey = sortKey === 'perf' ? 'scorePerformance'
        : sortKey === 'a11y' ? 'scoreAccessibility'
          : sortKey === 'seo' ? 'scoreSeo'
            : sortKey === 'bp' ? 'scoreBestPractices'
              : sortKey === 'lcp' ? 'lcp' : sortKey === 'cls' ? 'cls' : 'scorePerformance'
      filtered.sort((a, b) => {
        const av = a.deltas[metricKey] ?? 0
        const bv = b.deltas[metricKey] ?? 0
        return sortDir === 'asc' ? av - bv : bv - av
      })
    }
    else {
      filtered.sort((a, b) => a.url.localeCompare(b.url))
    }

    const total = filtered.length
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 100
    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    const counts = { regressed: 0, improved: 0, added: 0, removed: 0, unchanged: 0 }
    for (const r of allRows) counts[r.status]++

    const [baseScan, currentScan] = await Promise.all([
      ctx.storage.scans.get(input.baseScanId as unknown as never),
      ctx.storage.scans.get(input.currentScanId as unknown as never),
    ])

    const baseScores = baseScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined
    const currentScores = currentScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined
    const baseAvg = baseScan?.summary?.scoreAverage ?? null
    const currentAvg = currentScan?.summary?.scoreAverage ?? null

    const categoryDeltas = CATEGORY_ORDER.map((category) => {
      const base = baseScores?.[category] ?? null
      const current = currentScores?.[category] ?? null
      const delta = base != null && current != null ? current - base : null
      return { category, label: CATEGORY_LABEL[category], base, current, delta }
    })

    return {
      baseScanId: input.baseScanId,
      currentScanId: input.currentScanId,
      summary: {
        totalRoutes: allRows.length,
        changedRoutes: counts.regressed + counts.improved + counts.added + counts.removed,
        regressedRoutes: counts.regressed,
        improvedRoutes: counts.improved,
        addedRoutes: counts.added,
        removedRoutes: counts.removed,
        avgScoreDelta: baseAvg != null && currentAvg != null ? currentAvg - baseAvg : null,
        categoryDeltas,
      },
      routes: { items, total, page, pageSize },
    } as unknown as CommandOutput<typeof CompareDetail>
  },
}

async function emitCompareComplete(ctx: HandlerCtx, baseScanId: string, currentScanId: string, regressions: number, improvements: number) {
  const hooks = ctx.core.hooks as { callHook: (event: string, payload: unknown) => Promise<void> } | undefined
  await hooks?.callHook('compare:complete', { baseScanId, currentScanId, regressions, improvements })
}

// ── Markdown rendering helpers ─────────────────────────────────────────────
//
// The PR-comment renderer in `compareMarkdown` is intentionally structured for
// drive-by review: a single-line verdict, a category delta table, then the
// noisiest regressing / most improved routes capped at TOP_N. We aggregate
// route-level deltas across categories so a route only appears once in each
// list (worst-category drop / best-category gain) rather than spamming the
// reviewer with per-metric rows.

const TOP_N = 5
const CATEGORY_ORDER: Category[] = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing']
const CATEGORY_LABEL: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best Practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic Browsing',
}

function scoreCell(value: number | null | undefined): string {
  if (value == null)
    return '—'
  return String(Math.round(value * 100))
}

function deltaArrow(delta: number, threshold: number): string {
  // Use a unicode arrow for screen-reader friendliness; threshold treats
  // anything inside the band as "unchanged" to avoid noise from rounding.
  if (delta > threshold)
    return '▲'
  if (-delta > threshold)
    return '▼'
  return '−'
}

function signed(delta: number): string {
  if (delta === 0)
    return '0'
  const value = Math.round(delta * 100)
  return value > 0 ? `+${value}` : `${value}`
}

// Pick the single worst (or best, for improvements) per-route category diff.
// We bucket by `${url}|${device}` to keep matrix scans coherent — see the
// rowKey comment above for why URL alone isn't sufficient.
function pickTopRouteDiffs(diffs: Diff[], mode: 'regression' | 'improvement'): Diff[] {
  const onlyScores = diffs.filter(d => CATEGORY_COL[d.metric as string])
  const byRoute = new Map<string, Diff>()
  for (const d of onlyScores) {
    const key = `${d.url}|${d.device}`
    const incumbent = byRoute.get(key)
    if (!incumbent) {
      byRoute.set(key, d)
      continue
    }
    // For regressions: most negative delta wins. For improvements: most
    // positive. Score deltas are bounded to [-1, 1] so direct comparison is
    // safe without normalisation.
    const incumbentBetter = mode === 'regression'
      ? incumbent.delta <= d.delta
      : incumbent.delta >= d.delta
    if (!incumbentBetter)
      byRoute.set(key, d)
  }
  const sorted = [...byRoute.values()].sort((a, b) =>
    mode === 'regression' ? a.delta - b.delta : b.delta - a.delta,
  )
  return sorted.slice(0, TOP_N)
}

interface CategoryDelta {
  category: Category
  base: number | null
  current: number | null
  delta: number
}

function categoryDeltasFromSummaries(
  base: Partial<Record<Category, number>> | null | undefined,
  current: Partial<Record<Category, number>> | null | undefined,
): CategoryDelta[] {
  return CATEGORY_ORDER.map((category) => {
    const b = base?.[category] ?? null
    const c = current?.[category] ?? null
    const delta = b != null && c != null ? c - b : 0
    return { category, base: b, current: c, delta }
  })
}

export const compareMarkdown: Handler<typeof CompareMarkdown> = {
  command: {} as typeof CompareMarkdown,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)
    const title = input.title ?? 'Unlighthouse comparison'

    const [baseScan, currentScan] = await Promise.all([
      ctx.storage.scans.get(input.baseScanId as unknown as never),
      ctx.storage.scans.get(input.currentScanId as unknown as never),
    ])

    const categoryThreshold = report.thresholds.performance ?? 0.05
    const categoryDeltas = categoryDeltasFromSummaries(
      baseScan?.summary?.scoresByCategory,
      currentScan?.summary?.scoresByCategory,
    )

    const overallBase = baseScan?.summary?.scoreAverage ?? null
    const overallCurrent = currentScan?.summary?.scoreAverage ?? null
    const overallDelta = overallBase != null && overallCurrent != null
      ? overallCurrent - overallBase
      : 0
    const overallArrow = overallBase != null && overallCurrent != null
      ? deltaArrow(overallDelta, categoryThreshold)
      : '−'

    const verdictWord = report.regressions.length
      ? 'Regressions detected'
      : report.improvements.length
        ? 'Improvements detected'
        : 'No significant change'

    const lines: string[] = []
    lines.push(`## ${title}`)
    lines.push('')
    lines.push(`**${verdictWord}** — overall score ${scoreCell(overallBase)} → ${scoreCell(overallCurrent)} ${overallArrow} (${signed(overallDelta)})`)
    lines.push('')
    lines.push(`Comparing base \`${input.baseScanId.slice(0, 8)}\` → current \`${input.currentScanId.slice(0, 8)}\` · ${report.regressions.length} regression${report.regressions.length === 1 ? '' : 's'}, ${report.improvements.length} improvement${report.improvements.length === 1 ? '' : 's'}.`)

    // ── Category deltas ────────────────────────────────────────────────────
    // Always rendered, even when a category is missing — the `—` placeholder
    // makes it obvious that the scan didn't measure it (e.g. matrix scan
    // without a desktop device).
    lines.push('')
    lines.push('### Category scores')
    lines.push('')
    lines.push('| Category | Base | Current | Δ |')
    lines.push('|----------|------|---------|---|')
    for (const cd of categoryDeltas) {
      const arrow = cd.base != null && cd.current != null
        ? deltaArrow(cd.delta, categoryThreshold)
        : '−'
      lines.push(`| ${CATEGORY_LABEL[cd.category]} | ${scoreCell(cd.base)} | ${scoreCell(cd.current)} | ${arrow} ${signed(cd.delta)} |`)
    }

    // ── Top regressions ────────────────────────────────────────────────────
    const topRegressions = pickTopRouteDiffs(report.regressions, 'regression')
    if (topRegressions.length) {
      lines.push('')
      lines.push(`### Worst regressions (top ${topRegressions.length})`)
      lines.push('')
      lines.push('| Route | Device | Category | Base | Current | Δ |')
      lines.push('|-------|--------|----------|------|---------|---|')
      for (const r of topRegressions) {
        const arrow = deltaArrow(r.delta, categoryThreshold)
        lines.push(`| \`${r.url}\` | ${r.device} | ${CATEGORY_LABEL[r.metric as Category]} | ${scoreCell(r.base)} | ${scoreCell(r.current)} | ${arrow} ${signed(r.delta)} |`)
      }
    }

    // ── Top improvements ───────────────────────────────────────────────────
    const topImprovements = pickTopRouteDiffs(report.improvements, 'improvement')
    if (topImprovements.length) {
      lines.push('')
      lines.push(`### Best improvements (top ${topImprovements.length})`)
      lines.push('')
      lines.push('| Route | Device | Category | Base | Current | Δ |')
      lines.push('|-------|--------|----------|------|---------|---|')
      for (const r of topImprovements) {
        const arrow = deltaArrow(r.delta, categoryThreshold)
        lines.push(`| \`${r.url}\` | ${r.device} | ${CATEGORY_LABEL[r.metric as Category]} | ${scoreCell(r.base)} | ${scoreCell(r.current)} | ${arrow} ${signed(r.delta)} |`)
      }
    }

    lines.push('')
    lines.push('<sub>Generated by [Unlighthouse](https://unlighthouse.dev).</sub>')

    return {
      markdown: `${lines.join('\n')}\n`,
      hasRegressions: report.regressions.length > 0,
    } as CommandOutput<typeof CompareMarkdown>
  },
}

export const compareFindPrevious: Handler<typeof CompareFindPrevious> = {
  command: {} as typeof CompareFindPrevious,
  async run(input, ctx) {
    const previous = await ctx.storage.scans.findPrevious({
      site: input.site,
      device: input.device,
      branch: input.branch,
      excludeScanId: input.excludeScanId,
    })
    return { scanId: previous?.scanId ?? null } as CommandOutput<typeof CompareFindPrevious>
  },
}
