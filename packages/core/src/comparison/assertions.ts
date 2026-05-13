import type { ScanRouteRow } from '@unlighthouse/contracts/drizzle'
import type { Assertion, AssertionResult } from '../report/types'
import { assertions as assertionsTable, scanRoutes, scans } from '@unlighthouse/contracts/drizzle'
import { and, desc, eq, ne } from 'drizzle-orm'

type AnyDrizzle = any

/** Score column name mapping from assertion category to v1 DB column */
const SCORE_COLUMN_MAP: Record<string, keyof ScanRouteRow> = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
  'bestPractices': 'scoreBestPractices',
}

const METRIC_COLUMN_MAP: Record<string, keyof ScanRouteRow> = {
  lcp: 'lcp',
  cls: 'cls',
  tbt: 'tbt',
  fcp: 'fcp',
  si: 'si',
  ttfb: 'ttfb',
  inp: 'inp',
}

function getRouteValues(routes: ScanRouteRow[], key: keyof ScanRouteRow) {
  return routes
    .filter(r => r[key] != null)
    .map(r => ({ url: r.url, path: r.path, value: r[key] as number }))
}

function evaluateMinScore(routes: ScanRouteRow[], assertion: Assertion): AssertionResult {
  const column = SCORE_COLUMN_MAP[assertion.category ?? '']
  if (!column)
    return { assertion, passed: true, actual: 0 }

  const values = getRouteValues(routes, column)
  if (values.length === 0)
    return { assertion, passed: true, actual: 0 }

  // v1 stores scores 0-1; assertion.value is also 0-1.
  const threshold = assertion.value

  if (assertion.failOn === 'average') {
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length
    return { assertion, passed: avg >= threshold, actual: avg }
  }

  const failing = values.filter(v => v.value < threshold)
  const minVal = Math.min(...values.map(v => v.value))
  return {
    assertion,
    passed: failing.length === 0,
    actual: minVal,
    failingRoutes: failing.length > 0 ? failing : undefined,
  }
}

function evaluateMaxNumeric(routes: ScanRouteRow[], assertion: Assertion): AssertionResult {
  const column = METRIC_COLUMN_MAP[assertion.metric ?? '']
  if (!column)
    return { assertion, passed: true, actual: 0 }

  const values = getRouteValues(routes, column)
  if (values.length === 0)
    return { assertion, passed: true, actual: 0 }

  const threshold = assertion.value

  if (assertion.failOn === 'average') {
    const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length
    return { assertion, passed: avg <= threshold, actual: avg }
  }

  const failing = values.filter(v => v.value > threshold)
  const maxVal = Math.max(...values.map(v => v.value))
  return {
    assertion,
    passed: failing.length === 0,
    actual: maxVal,
    failingRoutes: failing.length > 0 ? failing : undefined,
  }
}

function evaluateMaxRegression(
  currentRoutes: ScanRouteRow[],
  baseRoutes: ScanRouteRow[],
  assertion: Assertion,
): AssertionResult {
  const isScore = !!assertion.category
  const column: keyof ScanRouteRow | undefined = isScore
    ? SCORE_COLUMN_MAP[assertion.category ?? '']
    : METRIC_COLUMN_MAP[assertion.metric ?? '']

  if (!column)
    return { assertion, passed: true, actual: 0 }

  const threshold = assertion.value

  const baseByPath = new Map(baseRoutes.map(r => [r.path, r]))
  const deltas: { url: string, path: string, delta: number }[] = []

  for (const current of currentRoutes) {
    const base = baseByPath.get(current.path)
    if (!base)
      continue

    const currentVal = current[column] as number | null
    const baseVal = base[column] as number | null
    if (currentVal == null || baseVal == null)
      continue

    const regression = isScore ? baseVal - currentVal : currentVal - baseVal
    deltas.push({ url: current.url, path: current.path, delta: regression })
  }

  if (deltas.length === 0)
    return { assertion, passed: true, actual: 0 }

  if (assertion.failOn === 'average') {
    const avg = deltas.reduce((s, d) => s + d.delta, 0) / deltas.length
    return { assertion, passed: avg <= threshold, actual: avg }
  }

  const failing = deltas.filter(d => d.delta > threshold)
  const maxDelta = Math.max(...deltas.map(d => d.delta))
  return {
    assertion,
    passed: failing.length === 0,
    actual: maxDelta,
    failingRoutes: failing.length > 0
      ? failing.map(f => ({ url: f.url, path: f.path, value: f.delta }))
      : undefined,
  }
}

export function evaluateAssertions(
  routes: ScanRouteRow[],
  assertions: Assertion[],
  baseRoutes: ScanRouteRow[] = [],
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
export async function evaluateAndStoreAssertions(
  db: AnyDrizzle,
  scanId: string,
  assertionConfigs: Assertion[],
): Promise<AssertionResult[]> {
  const routes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId))

  let baseRoutes: ScanRouteRow[] = []
  const needsBase = assertionConfigs.some(a => a.type === 'maxRegression')
  if (needsBase) {
    const [currentScan] = await db.select().from(scans).where(eq(scans.scanId, scanId)).limit(1)
    if (currentScan) {
      const [previousScan] = await db.select()
        .from(scans)
        .where(and(
          eq(scans.site, currentScan.site),
          eq(scans.status, 'complete'),
          ne(scans.scanId, scanId),
        ))
        .orderBy(desc(scans.completedAt))
        .limit(1)

      if (previousScan)
        baseRoutes = await db.select().from(scanRoutes).where(eq(scanRoutes.scanId, previousScan.scanId))
    }
  }

  const results = evaluateAssertions(routes, assertionConfigs, baseRoutes)

  if (results.length > 0) {
    await db.insert(assertionsTable).values(
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
    )
  }

  return results
}
