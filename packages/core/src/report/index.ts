import type { HTMLExtractPayload } from '@unlighthouse/contracts'
// v1 core/report — orchestrates per-category processors over a scan's LHRs.
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ExtractedRoute } from './types'
import { gunzipSync } from 'node:zlib'
import { and, desc, eq, ne } from 'drizzle-orm'
import { compareScans } from '../comparison/comparison'
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
  scanRoutes,
  scans,
  securityIssues,
  seoDuplicates,
  seoMeta,
  tapTargetIssues,
  thirdPartyScripts,
  vulnerableLibraries,
} from '../storage/drizzle/schema/history'
import { processAccessibility } from './accessibility'
import { processBestPractices } from './best-practices'
import { extractRouteData } from './extract'
import { processPerformance } from './performance'
import { processSeo } from './seo'

export { decompressLhr, extractRouteData } from './extract'
export * from './types'

function clearDashboardData(db: BetterSQLite3Database, scanId: string) {
  db.delete(dashboardSummaries).where(eq(dashboardSummaries.scanId, scanId)).run()
  db.delete(performanceIssues).where(eq(performanceIssues.scanId, scanId)).run()
  db.delete(thirdPartyScripts).where(eq(thirdPartyScripts.scanId, scanId)).run()
  db.delete(lcpElements).where(eq(lcpElements.scanId, scanId)).run()
  db.delete(accessibilityIssues).where(eq(accessibilityIssues.scanId, scanId)).run()
  db.delete(accessibilityElements).where(eq(accessibilityElements.scanId, scanId)).run()
  db.delete(missingAltImages).where(eq(missingAltImages.scanId, scanId)).run()
  db.delete(securityIssues).where(eq(securityIssues.scanId, scanId)).run()
  db.delete(detectedLibraries).where(eq(detectedLibraries.scanId, scanId)).run()
  db.delete(vulnerableLibraries).where(eq(vulnerableLibraries.scanId, scanId)).run()
  db.delete(deprecatedApis).where(eq(deprecatedApis.scanId, scanId)).run()
  db.delete(consoleErrors).where(eq(consoleErrors.scanId, scanId)).run()
  db.delete(seoMeta).where(eq(seoMeta.scanId, scanId)).run()
  db.delete(seoDuplicates).where(eq(seoDuplicates.scanId, scanId)).run()
  db.delete(canonicalChains).where(eq(canonicalChains.scanId, scanId)).run()
  db.delete(linkTextIssues).where(eq(linkTextIssues.scanId, scanId)).run()
  db.delete(tapTargetIssues).where(eq(tapTargetIssues.scanId, scanId)).run()
}

export async function processScanData(
  db: BetterSQLite3Database,
  scanId: string,
  htmlData?: Map<string, HTMLExtractPayload>,
  options: { compare?: boolean, thresholds?: Record<string, number> } = {},
) {
  clearDashboardData(db, scanId)

  const routes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

  const extractedRoutes = new Map<string, ExtractedRoute>()
  for (const route of routes) {
    if (!route.lhrGzip)
      continue
    const lhr = JSON.parse(gunzipSync(route.lhrGzip).toString())
    extractedRoutes.set(route.path, extractRouteData(lhr))
  }

  if (extractedRoutes.size === 0) {
    console.warn(`[process] No LHR data found for scan ${scanId}`)
    return null
  }

  const scan = db.select().from(scans).where(eq(scans.id, scanId)).get()
  const siteHost = scan?.site ? new URL(scan.site).hostname : undefined

  const params = {
    db,
    scanId,
    routes: extractedRoutes,
    htmlData,
    siteHost,
  }

  const [perfSummary, a11ySummary, bpSummary, seoSummary] = await Promise.all([
    processPerformance(params),
    processAccessibility(params),
    processBestPractices(params),
    processSeo(params),
  ])

  db.insert(dashboardSummaries).values({
    scanId,
    performanceSummary: JSON.stringify(perfSummary),
    accessibilitySummary: JSON.stringify(a11ySummary),
    bestPracticesSummary: JSON.stringify(bpSummary),
    seoSummary: JSON.stringify(seoSummary),
  }).run()

  if (options.compare !== false) {
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

      if (previousScan) {
        await compareScans(db, previousScan.id, scanId, options.thresholds)
      }
    }
  }

  return {
    performance: perfSummary,
    accessibility: a11ySummary,
    bestPractices: bpSummary,
    seo: seoSummary,
  }
}

export function getDashboardSummary(db: BetterSQLite3Database, scanId: string) {
  const summary = db.select().from(dashboardSummaries).where(eq(dashboardSummaries.scanId, scanId)).get()
  if (!summary)
    return null

  return {
    id: summary.id,
    scanId: summary.scanId,
    performance: summary.performanceSummary ? JSON.parse(summary.performanceSummary) : null,
    accessibility: summary.accessibilitySummary ? JSON.parse(summary.accessibilitySummary) : null,
    bestPractices: summary.bestPracticesSummary ? JSON.parse(summary.bestPracticesSummary) : null,
    seo: summary.seoSummary ? JSON.parse(summary.seoSummary) : null,
    computedAt: summary.computedAt,
  }
}
