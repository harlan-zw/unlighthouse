import type { ScanRouteRow as ScanRoute } from '@unlighthouse/contracts/drizzle'
import type { ComparisonDiff, MetricDiff } from '../report/types'
import { comparisonDiffs, comparisons, scanRoutes } from '@unlighthouse/contracts/drizzle'
import { eq } from 'drizzle-orm'

type AnyDrizzle = any

export const DEFAULT_THRESHOLDS: Record<string, number> = {
  lcp: 500, // 500ms
  cls: 0.1, // CLS unit (v1 stores raw float)
  tbt: 200,
  fcp: 300,
  si: 500,
  ttfb: 200,
  inp: 200,
  performance: 0.05, // 5 points on 0-1 scale (v1)
  accessibility: 0.05,
  bestpractices: 0.05,
  seo: 0.05,
}

type ScanRouteRecord = Pick<ScanRoute, | 'path' | 'url'
  | 'lcp' | 'cls' | 'tbt' | 'fcp' | 'si' | 'ttfb' | 'inp'
  | 'scorePerformance' | 'scoreAccessibility' | 'scoreBestPractices' | 'scoreSeo'>

function compareRouteMetrics(base: ScanRouteRecord, current: ScanRouteRecord, thresholds: Record<string, number> = DEFAULT_THRESHOLDS): MetricDiff[] {
  const metrics = [
    'lcp',
    'cls',
    'tbt',
    'fcp',
    'si',
    'ttfb',
    'inp',
    'scorePerformance',
    'scoreAccessibility',
    'scoreBestPractices',
    'scoreSeo',
  ] as const

  return metrics.map((name) => {
    const baseVal = (base as any)[name] ?? 0
    const currentVal = (current as any)[name] ?? 0
    const delta = currentVal - baseVal
    const thresholdKey = name.startsWith('score') ? name.slice(5).toLowerCase() : name
    const threshold = thresholds[thresholdKey] ?? DEFAULT_THRESHOLDS[thresholdKey] ?? 5

    // For scores, higher is better. For timings, lower is better.
    const isScore = name.startsWith('score')
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

export async function compareScans(db: AnyDrizzle, baseScanId: string, currentScanId: string, thresholds?: Record<string, number>) {
  const baseRoutes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, baseScanId))
  const currentRoutes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, currentScanId))
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) }

  const baseByPath = new Map((baseRoutes as ScanRouteRecord[]).map(r => [r.path, r]))
  const currentByPath = new Map((currentRoutes as ScanRouteRecord[]).map(r => [r.path, r]))

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

  const [comparison] = await db.insert(comparisons).values({
    baseScanId,
    currentScanId,
    improved,
    regressed,
    unchanged,
    newUrls: [...currentByPath.keys()].filter(p => !baseByPath.has(p)).length,
    removedUrls: [...baseByPath.keys()].filter(p => !currentByPath.has(p)).length,
  }).returning()

  if (diffs.length > 0) {
    await db.insert(comparisonDiffs).values(
      diffs.map(diff => ({
        comparisonId: comparison.id,
        path: diff.path,
        url: diff.url,
        metricDiffs: JSON.stringify(diff.metricDiffs),
        severity: diff.severity,
      })),
    )
  }

  return comparison
}

export async function getComparisonSummary(db: AnyDrizzle, comparisonId: number) {
  const [comparison] = await db.select().from(comparisons).where(eq(comparisons.id, comparisonId)).limit(1)
  if (!comparison)
    return null

  const diffs = await db.select().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparisonId))

  return {
    ...comparison,
    diffs: diffs.map((d: any) => ({
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
