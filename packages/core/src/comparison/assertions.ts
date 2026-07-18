import type { ScanRouteRow, ScanRow } from '@unlighthouse/contracts/drizzle'
import type { Assertion, AssertionResult, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { assertions as assertionsTable, scanRoutes, scans } from '@unlighthouse/contracts/drizzle'
import { ScanRouteSchema } from '@unlighthouse/contracts/types/atoms'
import { and, desc, eq, ne } from 'drizzle-orm'
import { chunkRowsByBindLimit } from '../storage/drizzle/bind-chunks'
import { asDrizzleDatabase } from '../storage/drizzle/types'
import { evaluateAssertions, isRouteCategory } from './policy'

function toScanRoutes(rows: ScanRouteRow[]): ScanRoute[] {
  return rows.map(row => ScanRouteSchema.parse(row))
}

function assertionColumns(assertion: Assertion): { category: string | null, metric: string | null } {
  if (assertion.type === 'minScore')
    return { category: assertion.category, metric: null }
  if (assertion.type === 'maxNumericValue')
    return { category: null, metric: assertion.metric }
  return isRouteCategory(assertion.metric)
    ? { category: assertion.metric, metric: null }
    : { category: null, metric: assertion.metric }
}

/** Drizzle adapter: load routes, apply the canonical policy, materialise results. */
export async function evaluateAndStoreAssertions(
  db: unknown,
  scanId: string,
  assertionConfigs: Assertion[],
): Promise<AssertionResult[]> {
  const sqlDb = asDrizzleDatabase(db)
  const routeRows = await sqlDb.select<ScanRouteRow>().from(scanRoutes).where(eq(scanRoutes.scanId, scanId))

  let baseRouteRows: ScanRouteRow[] = []
  if (assertionConfigs.some(assertion => assertion.type === 'maxRegression')) {
    const [currentScan] = await sqlDb.select<ScanRow>().from(scans).where(eq(scans.scanId, scanId)).limit(1)
    if (currentScan) {
      const [previousScan] = await sqlDb.select<ScanRow>()
        .from(scans)
        .where(and(
          eq(scans.site, currentScan.site),
          eq(scans.status, 'complete'),
          ne(scans.scanId, scanId),
        ))
        .orderBy(desc(scans.completedAt))
        .limit(1)
      if (previousScan)
        baseRouteRows = await sqlDb.select<ScanRouteRow>().from(scanRoutes).where(eq(scanRoutes.scanId, previousScan.scanId))
    }
  }

  const results = evaluateAssertions(toScanRoutes(routeRows), assertionConfigs, toScanRoutes(baseRouteRows))
  if (results.length === 0)
    return results

  const rows = results.map((result) => {
    const { category, metric } = assertionColumns(result.assertion)
    return {
      scanId,
      type: result.assertion.type,
      category,
      metric,
      value: result.assertion.value,
      passed: result.passed,
      actual: result.actual ?? 0,
      // Kept in the legacy column for storage compatibility; the canonical
      // result identifies only the worst route.
      failingRoutes: result.url ? JSON.stringify([{ url: result.url }]) : null,
    }
  })

  // Assertion evaluation is a materialised result for a scan, not an append
  // log. Replace it so retries are idempotent, and never leave a partial set.
  await sqlDb.delete(assertionsTable).where(eq(assertionsTable.scanId, scanId))
  try {
    // Eight bound values per row; cap each INSERT at 12 rows / 96 binds.
    for (const chunk of chunkRowsByBindLimit(rows, 8))
      await sqlDb.insert(assertionsTable).values(chunk)
  }
  catch (error) {
    let cleanupError: unknown
    await Promise.resolve(sqlDb.delete(assertionsTable).where(eq(assertionsTable.scanId, scanId))).catch((cause) => { cleanupError = cause })
    if (cleanupError !== undefined)
      throw new AggregateError([error, cleanupError], 'Assertion write and rollback both failed')
    throw error
  }

  return results
}
