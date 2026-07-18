import type { RouteDiff } from '@unlighthouse/contracts/commands'
import type { ComparisonDiffRow, ComparisonRow, ScanRouteRow } from '@unlighthouse/contracts/drizzle'
import type { Device, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { MetricDiff } from '../report/types'
import { comparisonDiffs, comparisons, scanRoutes } from '@unlighthouse/contracts/drizzle'
import { ScanRouteSchema } from '@unlighthouse/contracts/types/atoms'
import { and, eq } from 'drizzle-orm'
import { MetricDiffSchema } from '../report/types'
import { chunkRowsByBindLimit } from '../storage/drizzle/bind-chunks'
import { asDrizzleDatabase } from '../storage/drizzle/types'
import { compareRoutes, routeIdentityKey } from './policy'

function toScanRoutes(rows: ScanRouteRow[]): ScanRoute[] {
  return rows.map(row => ScanRouteSchema.parse(row))
}

function toMetricDiff(diff: RouteDiff): MetricDiff | null {
  if (diff.base == null || diff.current == null)
    return null
  return {
    name: diff.metric,
    base: diff.base,
    current: diff.current,
    delta: diff.delta,
    deltaPercent: diff.base ? Math.round((diff.delta / diff.base) * 100) : 0,
    severity: diff.regressed ? 'regression' : 'improvement',
  }
}

function groupPersistedDiffs(
  routes: ScanRoute[],
  regressions: RouteDiff[],
  improvements: RouteDiff[],
): Array<{ path: string, url: string, device: Device, metricDiffs: MetricDiff[], severity: 'regression' | 'improvement' }> {
  const routesByKey = new Map(routes.map(route => [routeIdentityKey(route), route]))
  const grouped = new Map<string, { metricDiffs: MetricDiff[], severity: 'regression' | 'improvement' }>()

  for (const diff of [...regressions, ...improvements]) {
    const metricDiff = toMetricDiff(diff)
    if (!metricDiff)
      continue
    const key = routeIdentityKey(diff)
    const current = grouped.get(key)
    const severity = diff.regressed || current?.severity === 'regression' ? 'regression' : 'improvement'
    grouped.set(key, { metricDiffs: [...(current?.metricDiffs ?? []), metricDiff], severity })
  }

  return [...grouped.entries()].flatMap(([key, diff]) => {
    const route = routesByKey.get(key)
    return route ? [{ path: route.path, url: route.url, device: route.device, ...diff }] : []
  })
}

export async function compareScans(db: unknown, baseScanId: string, currentScanId: string, thresholds?: Record<string, number>) {
  const sqlDb = asDrizzleDatabase(db)
  const [baseRows, currentRows] = await Promise.all([
    sqlDb.select<ScanRouteRow>().from(scanRoutes).where(eq(scanRoutes.scanId, baseScanId)),
    sqlDb.select<ScanRouteRow>().from(scanRoutes).where(eq(scanRoutes.scanId, currentScanId)),
  ])
  const baseRoutes = toScanRoutes(baseRows)
  const currentRoutes = toScanRoutes(currentRows)
  const result = compareRoutes({ baseRoutes, currentRoutes, thresholds })
  const diffs = groupPersistedDiffs(currentRoutes, result.regressions, result.improvements)

  const values = {
    baseScanId,
    currentScanId,
    improved: result.counts.improved,
    regressed: result.counts.regressed,
    unchanged: result.counts.unchanged,
    newUrls: result.counts.added,
    removedUrls: result.counts.removed,
  }
  const priorRows = await sqlDb
    .select<ComparisonRow>()
    .from(comparisons)
    .where(and(eq(comparisons.baseScanId, baseScanId), eq(comparisons.currentScanId, currentScanId)))
  const [prior, ...duplicatePriors] = priorRows
  for (const duplicate of duplicatePriors)
    await sqlDb.delete(comparisons).where(eq(comparisons.id, duplicate.id))
  const [comparison] = prior
    ? await sqlDb.update<ComparisonRow>(comparisons).set(values).where(eq(comparisons.id, prior.id)).returning()
    : await sqlDb.insert<ComparisonRow>(comparisons).values(values).returning()
  if (!comparison)
    throw new Error('compareScans: comparison insert returned no row')

  try {
    // A repeated comparison of the same scan pair replaces the previous
    // materialisation. Thresholds were never persisted, so retaining duplicate
    // headers for one pair only made retries observable as duplicate history.
    await sqlDb.delete(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparison.id))
    const rows = diffs.map(diff => ({
      comparisonId: comparison.id,
      path: diff.path,
      url: diff.url,
      device: diff.device,
      metricDiffs: JSON.stringify(diff.metricDiffs),
      severity: diff.severity,
    }))
    // Six bound values per row; cap each INSERT below D1's 100-bind ceiling.
    for (const chunk of chunkRowsByBindLimit(rows, 6))
      await sqlDb.insert(comparisonDiffs).values(chunk)
  }
  catch (error) {
    // Do not expose a header with a partial diff set. Deleting the header also
    // cascades any chunks that committed before the failure.
    let cleanupError: unknown
    await Promise.resolve(sqlDb.delete(comparisons).where(eq(comparisons.id, comparison.id))).catch((cause) => { cleanupError = cause })
    if (cleanupError !== undefined)
      throw new AggregateError([error, cleanupError], 'Comparison write and rollback both failed')
    throw error
  }

  return comparison
}

function parseMetricDiffs(raw: string): MetricDiff[] {
  const parsed: unknown = JSON.parse(raw)
  const result = MetricDiffSchema.array().safeParse(parsed)
  return result.success ? result.data : []
}

export async function getComparisonSummary(db: unknown, comparisonId: number) {
  const sqlDb = asDrizzleDatabase(db)
  const [comparison] = await sqlDb.select<ComparisonRow>().from(comparisons).where(eq(comparisons.id, comparisonId)).limit(1)
  if (!comparison)
    return null

  const diffs = await sqlDb.select<ComparisonDiffRow>().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparisonId))

  return {
    ...comparison,
    diffs: diffs.map(d => ({
      ...d,
      metricDiffs: parseMetricDiffs(d.metricDiffs),
    })),
  }
}

interface ComparisonSummaryLike {
  baseScanId: string | null
  currentScanId: string | null
  improved: number
  regressed: number
  unchanged: number
  newUrls: number
  removedUrls: number
  diffs: Array<{
    path: string
    url: string
    device: string
    severity: string
    metricDiffs: MetricDiff[]
  }>
}

const METRIC_LABELS: Record<string, { label: string, unit: string, scale?: number }> = {
  lcp: { label: 'LCP', unit: 'ms' },
  cls: { label: 'CLS', unit: '', scale: 1000 },
  tbt: { label: 'TBT', unit: 'ms' },
  fcp: { label: 'FCP', unit: 'ms' },
  si: { label: 'SI', unit: 'ms' },
  ttfb: { label: 'TTFB', unit: 'ms' },
  inp: { label: 'INP', unit: 'ms' },
  performanceScore: { label: 'Perf', unit: '' },
  accessibilityScore: { label: 'A11y', unit: '' },
  bestPracticesScore: { label: 'BP', unit: '' },
  seoScore: { label: 'SEO', unit: '' },
}

function formatValue(name: string, value: number): string {
  const meta = METRIC_LABELS[name]
  if (!meta)
    return String(value)
  if (meta.scale)
    return (value / meta.scale).toFixed(3)
  return `${Math.round(value)}${meta.unit}`
}

/**
 * Render a comparison summary as GitHub-flavored Markdown suitable for PR comments.
 */
export function formatComparisonMarkdown(summary: ComparisonSummaryLike): string {
  const lines: string[] = []
  const icon = summary.regressed > 0 ? '❌' : summary.improved > 0 ? '✅' : 'ℹ️'

  lines.push(`## ${icon} Unlighthouse comparison`)
  lines.push('')
  lines.push(`- **Improved**: ${summary.improved}`)
  lines.push(`- **Regressed**: ${summary.regressed}`)
  lines.push(`- **Unchanged**: ${summary.unchanged}`)
  if (summary.newUrls)
    lines.push(`- **New URLs**: ${summary.newUrls}`)
  if (summary.removedUrls)
    lines.push(`- **Removed URLs**: ${summary.removedUrls}`)
  if (summary.baseScanId && summary.currentScanId) {
    lines.push('')
    lines.push(`_Base \`${summary.baseScanId.slice(0, 8)}\` → Current \`${summary.currentScanId.slice(0, 8)}\`_`)
  }

  const regressions = summary.diffs.filter(d => d.severity === 'regression')
  const improvements = summary.diffs.filter(d => d.severity === 'improvement')

  if (regressions.length) {
    lines.push('')
    lines.push('### Regressions')
    lines.push('')
    lines.push('| Route | Metric | Before | After | Δ |')
    lines.push('|-------|--------|--------|-------|---|')
    for (const d of regressions) {
      for (const m of d.metricDiffs.filter(m => m.severity === 'regression')) {
        const delta = m.delta > 0 ? `+${formatValue(m.name, m.delta)}` : formatValue(m.name, m.delta)
        lines.push(`| \`${d.path}\` (${d.device}) | ${METRIC_LABELS[m.name]?.label ?? m.name} | ${formatValue(m.name, m.base)} | ${formatValue(m.name, m.current)} | ${delta} |`)
      }
    }
  }

  if (improvements.length) {
    lines.push('')
    lines.push('### Improvements')
    lines.push('')
    lines.push('| Route | Metric | Before | After | Δ |')
    lines.push('|-------|--------|--------|-------|---|')
    for (const d of improvements) {
      for (const m of d.metricDiffs.filter(m => m.severity === 'improvement')) {
        const delta = m.delta > 0 ? `+${formatValue(m.name, m.delta)}` : formatValue(m.name, m.delta)
        lines.push(`| \`${d.path}\` (${d.device}) | ${METRIC_LABELS[m.name]?.label ?? m.name} | ${formatValue(m.name, m.base)} | ${formatValue(m.name, m.current)} | ${delta} |`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}
