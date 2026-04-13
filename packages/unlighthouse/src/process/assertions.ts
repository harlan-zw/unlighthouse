import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { Assertion, AssertionResult } from './types'
import { eq } from 'drizzle-orm'
import { assertions as assertionsTable, scanRoutes } from '../data/history/schema'

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

export function evaluateAssertions(
  routes: typeof scanRoutes.$inferSelect[],
  assertions: Assertion[],
): AssertionResult[] {
  return assertions.map((assertion) => {
    switch (assertion.type) {
      case 'minScore':
        return evaluateMinScore(routes, assertion)
      case 'maxNumericValue':
        return evaluateMaxNumeric(routes, assertion)
      case 'maxRegression':
        // maxRegression requires comparison data, handled separately
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
  const results = evaluateAssertions(routes, assertionConfigs)

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
