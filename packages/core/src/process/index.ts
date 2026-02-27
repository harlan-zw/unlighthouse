import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ExtractedRoute, HTMLExtractPayload } from './types'
import { gunzipSync } from 'node:zlib'
import { and, desc, eq, ne } from 'drizzle-orm'
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
} from '../data/history/schema'
import { processAccessibility } from './accessibility'
import { processBestPractices } from './best-practices'
import { compareScans } from './comparison'
import { extractRouteData } from './extract'
import { processPerformance } from './performance'
import { processSeo } from './seo'

export { compareScans, getComparisonSummary } from './comparison'
export { decompressLhr, extractRouteData } from './extract'
export * from './types'

/**
 * Clear existing dashboard data for a scan (for re-processing)
 */
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

/**
 * Process all scan data after scan completion
 * Extracts metrics, aggregates issues, and computes dashboard summaries
 */
export async function processScanData(db: BetterSQLite3Database, scanId: string, htmlData?: Map<string, HTMLExtractPayload>) {
  // Clear existing dashboard data (for re-processing)
  clearDashboardData(db, scanId)

  // 1. Load all route LHRs
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

  // Get site host for third-party detection
  const scan = db.select().from(scans).where(eq(scans.id, scanId)).get()
  const siteHost = scan?.site ? new URL(scan.site).hostname : undefined

  const params = {
    db,
    scanId,
    routes: extractedRoutes,
    htmlData,
    siteHost,
  }

  // 2. Process each category
  const [perfSummary, a11ySummary, bpSummary, seoSummary] = await Promise.all([
    processPerformance(params),
    processAccessibility(params),
    processBestPractices(params),
    processSeo(params),
  ])

  // 3. Store dashboard summaries
  db.insert(dashboardSummaries).values({
    scanId,
    performanceSummary: JSON.stringify(perfSummary),
    accessibilitySummary: JSON.stringify(a11ySummary),
    bestPracticesSummary: JSON.stringify(bpSummary),
    seoSummary: JSON.stringify(seoSummary),
  }).run()

  // 4. Auto-compare with previous scan (optional)
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
      await compareScans(db, previousScan.id, scanId)
    }
  }

  return {
    performance: perfSummary,
    accessibility: a11ySummary,
    bestPractices: bpSummary,
    seo: seoSummary,
  }
}

/**
 * Get dashboard summary for a scan
 */
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
