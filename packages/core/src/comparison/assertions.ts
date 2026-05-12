import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { Assertion, AssertionResult } from '../report/types'
import { and, desc, eq, ne } from 'drizzle-orm'
import { assertions as assertionsTable, scanRoutes, scans } from '../../../unlighthouse/src/data/history/schema'

/** Score column name mapping from assertion category to DB column */
const SCORE_COLUMN_MAP: Record<string, keyof typeof scanRoutes.$inferSelect> = {
  'performance': 'performanceScore',
  'accessibility': 'accessibilityScore',
  'seo': 'seoScore',
  'best-practices': 'bestPracticesScore',
  'bestPractices': 'bestPracticesScore',
}

/** Metric column mapping */
const METRIC_COLUMN_MAP: Record<string, keyof typeof scanRoutes.$inferSelect> = {
  lcp: 'lcp',
  cls: 'cls',
  tbt: 'tbt',
  fcp: 'fcp',
  si: 'si',
  ttfb: 'ttfb',
  inp: 'inp',
}

function getRouteValues(routes: typeof scanRoutes.$inferSelect[], key: keyof typeof scanRoutes.$inferSelect) {
  return routes
    .filter(r => r.status === 'complete' && r[key] != null)
    .map(r => ({ url: r.url, path: r.path, value: r[key] as number }))
}

function evaluateMinScore(routes: typeof scanRoutes.$inferSelect[], assertion: Assertion): AssertionResult {
  const column = SCORE_COLUMN_MAP[assertion.category ?? '']
  if (!column)
    return { assertion, passed: true, actual: 0 }

  const values = getRouteValues(routes, column)
  if (values.length === 0)
    return { assertion, passed: true, actual: 0 }

  // Scores stored as 0-100 in DB, assertion value is 0-1 scale
  const threshold = assertion.value * 100

  if (assertion.failOn === 'average') {
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length
    return { assertion, passed: avg >= threshold, actual: avg / 100 }
  }

  // failOn: 'any' (default)
  const failing = values.filter(v => v.value < threshold)
  const minVal = Math.min(...values.map(v => v.value))
  return {
    assertion,
    passed: failing.length === 0,
    actual: minVal / 100,
    failingRoutes: failing.length > 0 ? failing.map(v => ({ ...v, value: v.value / 100 })) : undefined,
  }
}

function evaluateMaxNumeric(routes: typeof scanRoutes.$inferSelect[], assertion: Assertion): AssertionResult {
  const column = METRIC_COLUMN_MAP[assertion.metric ?? '']
  if (!column)
    return { assertion, passed: true, actual: 0 }

  const values = getRouteValues(routes, column)
  if (values.length === 0)
    return { assertion, passed: true, actual: 0 }

  // CLS stored as x1000, convert back for comparison
  const isCls = assertion.metric === 'cls'
  const threshold = isCls ? assertion.value * 1000 : assertion.value

  if (assertion.failOn === 'average') {
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length
    return { assertion, passed: avg <= threshold, actual: isCls ? avg / 1000 : avg }
  }

  // failOn: 'any' (default)
  const failing = values.filter(v => v.value > threshold)
  const maxVal = Math.max(...values.map(v => v.value))
  return {
    assertion,
    passed: failing.length === 0,
    actual: isCls ? maxVal / 1000 : maxVal,
    failingRoutes: failing.length > 0
      ? failing.map(v => ({ ...v, value: isCls ? v.value / 1000 : v.value }))
      : undefined,
  }
}

/**
 * Evaluate maxRegression: fail if delta between base and current exceeds
 * threshold on any route (failOn: 'any') or on average (failOn: 'average').
 *
 * For scores, a regression is a drop. For metrics, a regression is an increase.
 * CLS is stored x1000; callers supply threshold in real CLS units.
 */
function evaluateMaxRegression(
  currentRoutes: typeof scanRoutes.$inferSelect[],
  baseRoutes: typeof scanRoutes.$inferSelect[],
  assertion: Assertion,
): AssertionResult {
  const isScore = !!assertion.category
  const column: keyof typeof scanRoutes.$inferSelect | undefined = isScore
    ? SCORE_COLUMN_MAP[assertion.category ?? '']
    : METRIC_COLUMN_MAP[assertion.metric ?? '']

  if (!column)
    return { assertion, passed: true, actual: 0 }

  const isCls = assertion.metric === 'cls'
  const threshold = isCls ? assertion.value * 1000 : assertion.value

  const baseByPath = new Map(baseRoutes.map(r => [r.path, r]))
  const deltas: { url: string, path: string, delta: number }[] = []

  for (const current of currentRoutes) {
    if (current.status !== 'complete')
      continue
    const base = baseByPath.get(current.path)
    if (!base || base.status !== 'complete')
      continue

    const currentVal = current[column] as number | null
    const baseVal = base[column] as number | null
    if (currentVal == null || baseVal == null)
      continue

    // Regression magnitude: for scores, drop; for metrics, increase.
    const regression = isScore ? baseVal - currentVal : currentVal - baseVal
    deltas.push({ url: current.url, path: current.path, delta: regression })
  }

  if (deltas.length === 0)
    return { assertion, passed: true, actual: 0 }

  if (assertion.failOn === 'average') {
    const avg = deltas.reduce((s, d) => s + d.delta, 0) / deltas.length
    return { assertion, passed: avg <= threshold, actual: isCls ? avg / 1000 : avg }
  }

  const failing = deltas.filter(d => d.delta > threshold)
  const maxDelta = Math.max(...deltas.map(d => d.delta))
  return {
    assertion,
    passed: failing.length === 0,
    actual: isCls ? maxDelta / 1000 : maxDelta,
    failingRoutes: failing.length > 0
      ? failing.map(f => ({ url: f.url, path: f.path, value: isCls ? f.delta / 1000 : f.delta }))
      : undefined,
  }
}

export function evaluateAssertions(
  routes: typeof scanRoutes.$inferSelect[],
  assertions: Assertion[],
  baseRoutes: typeof scanRoutes.$inferSelect[] = [],
): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'minScore':
        return evaluateMinScore(routes, assertion)
      case 'maxNumericValue':
        return evaluateMaxNumeric(routes, assertion)
      case 'maxRegression':
        return evaluateMaxRegression(routes, baseRoutes, assertion)
      default:
        return { assertion, passed: true, actual: 0 }
    }
  })
}

/** Evaluate and persist assertion results to database */
export function evaluateAndStoreAssertions(
  db: BetterSQLite3Database,
  scanId: string,
  assertionConfigs: Assertion[],
): AssertionResult[] {
  const routes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

  // Resolve base routes for maxRegression: most recent completed scan on same site, excluding this one.
  let baseRoutes: typeof scanRoutes.$inferSelect[] = []
  const needsBase = assertionConfigs.some(a => a.type === 'maxRegression')
  if (needsBase) {
    const currentScan = db.select().from(scans).where(eq(scans.id, scanId)).get()
    if (currentScan) {
      const previousScan = db.select()
        .from(scans)
        .where(and(
          eq(scans.site, currentScan.site),
          eq(scans.status, 'complete'),
          ne(scans.id, scanId),
        ))
        .orderBy(desc(scans.completedAt))
        .limit(1)
        .get()

      if (previousScan)
        baseRoutes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, previousScan.id)).all()
    }
  }

  const results = evaluateAssertions(routes, assertionConfigs, baseRoutes)

  // Store results
  if (results.length > 0) {
    db.insert(assertionsTable).values(
      results.map(r => ({
        scanId,
        type: r.assertion.type,
        category: r.assertion.category ?? null,
        metric: r.assertion.metric ?? null,
        value: r.assertion.value,
        passed: r.passed,
        actual: r.actual,
        failingRoutes: r.failingRoutes ? JSON.stringify(r.failingRoutes) : null,
      })),
    ).run()
  }

  return results
}
