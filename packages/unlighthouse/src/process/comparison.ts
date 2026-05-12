import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ComparisonDiff, MetricDiff } from './types'
import { eq } from 'drizzle-orm'
import { comparisonDiffs, comparisons, scanRoutes } from '../data/history/schema'

export const DEFAULT_THRESHOLDS: Record<string, number> = {
  lcp: 500, // 500ms change
  cls: 100, // 0.1 CLS (stored as x1000)
  tbt: 200, // 200ms
  fcp: 300,
  si: 500,
  ttfb: 200,
  inp: 200, // 200ms
  performance: 5, // 5 points (0-100 scale)
  accessibility: 5,
  bestPractices: 5,
  seo: 5,
}

interface ScanRouteRecord {
  path: string
  url: string
  lcp: number | null
  cls: number | null
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null
  inp: number | null
  performanceScore: number | null
  accessibilityScore: number | null
  bestPracticesScore: number | null
  seoScore: number | null
}

function compareRouteMetrics(base: ScanRouteRecord, current: ScanRouteRecord, thresholds: Record<string, number> = DEFAULT_THRESHOLDS): MetricDiff[] {
  const metrics = [
    'lcp',
    'cls',
    'tbt',
    'fcp',
    'si',
    'ttfb',
    'inp',
    'performanceScore',
    'accessibilityScore',
    'bestPracticesScore',
    'seoScore',
  ] as const

  return metrics.map((name) => {
    const baseVal = (base as any)[name] ?? 0
    const currentVal = (current as any)[name] ?? 0
    const delta = currentVal - baseVal
    const thresholdKey = name.replace('Score', '').toLowerCase()
    const threshold = thresholds[thresholdKey] ?? DEFAULT_THRESHOLDS[thresholdKey] ?? 5

    // For scores, higher is better. For timings, lower is better.
    const isScore = name.includes('Score')
    const isRegression = isScore ? delta < -threshold : delta > threshold
    const isImprovement = isScore ? delta > threshold : delta < -threshold

    return {
      name,
      base: baseVal,
      current: currentVal,
      delta,
      deltaPercent: baseVal ? Math.round((delta / baseVal) * 100) : 0,
      severity: isRegression ? 'regression' as const : isImprovement ? 'improvement' as const : 'neutral' as const,
    }
  }).filter(m => m.severity !== 'neutral')
}

export async function compareScans(db: BetterSQLite3Database, baseScanId: string, currentScanId: string, thresholds?: Record<string, number>) {
  const baseRoutes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, baseScanId)).all()
  const currentRoutes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, currentScanId)).all()
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) }

  const baseByPath = new Map(baseRoutes.map(r => [r.path, r as ScanRouteRecord]))
  const currentByPath = new Map(currentRoutes.map(r => [r.path, r as ScanRouteRecord]))

  const diffs: ComparisonDiff[] = []
  let improved = 0
  let regressed = 0
  let unchanged = 0

  for (const [path, current] of currentByPath) {
    const base = baseByPath.get(path)
    if (!base)
      continue

    const metricDiffs = compareRouteMetrics(base, current, resolvedThresholds)
    const hasRegression = metricDiffs.some(m => m.severity === 'regression')
    const hasImprovement = metricDiffs.some(m => m.severity === 'improvement')

    if (hasRegression)
      regressed++
    else if (hasImprovement)
      improved++
    else unchanged++

    if (hasRegression || hasImprovement) {
      diffs.push({
        path,
        url: current.url,
        metricDiffs,
        severity: hasRegression ? 'regression' : 'improvement',
      })
    }
  }

  // Insert comparison record
  const comparison = db.insert(comparisons).values({
    baseScanId,
    currentScanId,
    improved,
    regressed,
    unchanged,
    newUrls: [...currentByPath.keys()].filter(p => !baseByPath.has(p)).length,
    removedUrls: [...baseByPath.keys()].filter(p => !currentByPath.has(p)).length,
  }).returning().get()

  // Insert diffs
  if (diffs.length > 0) {
    db.insert(comparisonDiffs).values(
      diffs.map(diff => ({
        comparisonId: comparison.id,
        path: diff.path,
        url: diff.url,
        metricDiffs: JSON.stringify(diff.metricDiffs),
        severity: diff.severity,
      })),
    ).run()
  }

  return comparison
}

export function getComparisonSummary(db: BetterSQLite3Database, comparisonId: number) {
  const comparison = db.select().from(comparisons).where(eq(comparisons.id, comparisonId)).get()
  if (!comparison)
    return null

  const diffs = db.select().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparisonId)).all()

  return {
    ...comparison,
    diffs: diffs.map(d => ({
      ...d,
      metricDiffs: JSON.parse(d.metricDiffs),
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
        lines.push(`| \`${d.path}\` | ${METRIC_LABELS[m.name]?.label ?? m.name} | ${formatValue(m.name, m.base)} | ${formatValue(m.name, m.current)} | ${delta} |`)
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
        lines.push(`| \`${d.path}\` | ${METRIC_LABELS[m.name]?.label ?? m.name} | ${formatValue(m.name, m.base)} | ${formatValue(m.name, m.current)} | ${delta} |`)
      }
    }
  }

  return `${lines.join('\n')}\n`
}
