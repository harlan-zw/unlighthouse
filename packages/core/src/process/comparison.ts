import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ComparisonDiff, MetricDiff } from './types'
import { eq } from 'drizzle-orm'
import { comparisonDiffs, comparisons, scanRoutes } from '../data/history/schema'

const THRESHOLDS: Record<string, number> = {
  lcp: 500, // 500ms change
  cls: 100, // 0.1 CLS (stored as x1000)
  tbt: 200, // 200ms
  fcp: 300,
  si: 500,
  ttfb: 200,
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
  performanceScore: number | null
  accessibilityScore: number | null
  bestPracticesScore: number | null
  seoScore: number | null
}

function compareRouteMetrics(base: ScanRouteRecord, current: ScanRouteRecord): MetricDiff[] {
  const metrics = [
    'lcp',
    'cls',
    'tbt',
    'fcp',
    'si',
    'ttfb',
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
    const threshold = THRESHOLDS[thresholdKey] ?? 5

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

export async function compareScans(db: BetterSQLite3Database, baseScanId: string, currentScanId: string) {
  const baseRoutes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, baseScanId)).all()
  const currentRoutes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, currentScanId)).all()

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

    const metricDiffs = compareRouteMetrics(base, current)
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
