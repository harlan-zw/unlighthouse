import type { HTMLExtractPayload, Storage } from '@unlighthouse/contracts'
import type { ExtractedRoute } from './types'
import { gunzipSync } from 'node:zlib'
import {
  accessibilityElements,
  accessibilityIssues,
  canonicalChains,
  consoleErrors,
  dashboardSummaries,
  deprecatedApis,
  detectedLibraries,
  lcpElements,
  linkTextIssues,
  missingAltImages,
  performanceIssues,
  scans,
  securityIssues,
  seoDuplicates,
  seoMeta,
  tapTargetIssues,
  thirdPartyScripts,
  vulnerableLibraries,
} from '@unlighthouse/contracts/drizzle'
import { and, desc, eq, ne } from 'drizzle-orm'
import { compareScans } from '../comparison/comparison'
import { processAccessibility } from './accessibility'
import { processBestPractices } from './best-practices'
import { extractRouteData } from './extract'
import { processPerformance } from './performance'
import { processSeo } from './seo'

export { decompressLhr, extractRouteData } from './extract'
export * from './types'

type AnyDrizzle = any

function clearDashboardData(db: AnyDrizzle, scanId: string) {
  db.delete(dashboardSummaries).where(eq(dashboardSummaries.scanId, scanId)).run?.()
  db.delete(performanceIssues).where(eq(performanceIssues.scanId, scanId)).run?.()
  db.delete(thirdPartyScripts).where(eq(thirdPartyScripts.scanId, scanId)).run?.()
  db.delete(lcpElements).where(eq(lcpElements.scanId, scanId)).run?.()
  db.delete(accessibilityIssues).where(eq(accessibilityIssues.scanId, scanId)).run?.()
  db.delete(accessibilityElements).where(eq(accessibilityElements.scanId, scanId)).run?.()
  db.delete(missingAltImages).where(eq(missingAltImages.scanId, scanId)).run?.()
  db.delete(securityIssues).where(eq(securityIssues.scanId, scanId)).run?.()
  db.delete(detectedLibraries).where(eq(detectedLibraries.scanId, scanId)).run?.()
  db.delete(vulnerableLibraries).where(eq(vulnerableLibraries.scanId, scanId)).run?.()
  db.delete(deprecatedApis).where(eq(deprecatedApis.scanId, scanId)).run?.()
  db.delete(consoleErrors).where(eq(consoleErrors.scanId, scanId)).run?.()
  db.delete(seoMeta).where(eq(seoMeta.scanId, scanId)).run?.()
  db.delete(seoDuplicates).where(eq(seoDuplicates.scanId, scanId)).run?.()
  db.delete(canonicalChains).where(eq(canonicalChains.scanId, scanId)).run?.()
  db.delete(linkTextIssues).where(eq(linkTextIssues.scanId, scanId)).run?.()
  db.delete(tapTargetIssues).where(eq(tapTargetIssues.scanId, scanId)).run?.()
}

export interface ProcessScanDataOptions {
  compare?: boolean
  thresholds?: Record<string, number>
  htmlData?: Map<string, HTMLExtractPayload>
}

/**
 * Populate dashboard-private aggregation tables from a completed scan.
 *
 * Reads each route's LHR from the blob store (keyed by `scanRoutes.lhrBlobKey`),
 * derives per-category aggregates, and writes 17 detail tables + 1 summary
 * row. Idempotent: re-running clears prior aggregations for the scan first.
 *
 * `storage.db` must expose a sync drizzle handle (the better-sqlite3 escape
 * hatch on `drizzleStorage`); D1 + memory storage have no processor and skip.
 */
export async function processScanData(
  storage: Storage & { db?: AnyDrizzle },
  scanId: string,
  options: ProcessScanDataOptions = {},
) {
  const db = (storage as { db?: AnyDrizzle }).db
  if (!db) {
    // Storage adapter has no SQL handle (memory, D1). Skip; dashboards
    // degrade to "no detail data."
    return null
  }

  clearDashboardData(db, scanId)

  const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })

  const extractedRoutes = new Map<string, ExtractedRoute>()
  for (const route of routes) {
    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz)
      continue
    const lhr = JSON.parse(gunzipSync(gz).toString())
    extractedRoutes.set(route.path, extractRouteData(lhr))
  }

  if (extractedRoutes.size === 0) {
    console.warn(`[process] No LHR data found for scan ${scanId}`)
    return null
  }

  const scan = await storage.scans.get(scanId as never)
  const siteHost = scan?.site ? new URL(scan.site).hostname : undefined

  const params = {
    db,
    scanId,
    routes: extractedRoutes,
    htmlData: options.htmlData,
    siteHost,
  }

  const [perfSummary, a11ySummary, bpSummary, seoSummary] = await Promise.all([
    processPerformance(params),
    processAccessibility(params),
    processBestPractices(params),
    processSeo(params),
  ])

  await db.insert(dashboardSummaries).values({
    scanId,
    performanceSummary: JSON.stringify(perfSummary),
    accessibilitySummary: JSON.stringify(a11ySummary),
    bestPracticesSummary: JSON.stringify(bpSummary),
    seoSummary: JSON.stringify(seoSummary),
  })

  if (options.compare !== false) {
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
        await compareScans(db, previousScan.scanId, scanId, options.thresholds)
    }
  }

  return {
    performance: perfSummary,
    accessibility: a11ySummary,
    bestPractices: bpSummary,
    seo: seoSummary,
  }
}

export async function getDashboardSummary(storage: Storage, scanId: string) {
  const row = await storage.reports.dashboardSummary.get(scanId as never) as
    | { id: number, scanId: string, performanceSummary: string | null, accessibilitySummary: string | null, bestPracticesSummary: string | null, seoSummary: string | null, computedAt: Date | null }
    | null
  if (!row)
    return null

  return {
    id: row.id,
    scanId: row.scanId,
    performance: row.performanceSummary ? JSON.parse(row.performanceSummary) : null,
    accessibility: row.accessibilitySummary ? JSON.parse(row.accessibilitySummary) : null,
    bestPractices: row.bestPracticesSummary ? JSON.parse(row.bestPracticesSummary) : null,
    seo: row.seoSummary ? JSON.parse(row.seoSummary) : null,
    computedAt: row.computedAt,
  }
}
