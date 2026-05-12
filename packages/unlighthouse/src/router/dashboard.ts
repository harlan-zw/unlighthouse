import type { Router } from 'h3'
import { gunzipSync } from 'node:zlib'
import { desc, eq, or } from 'drizzle-orm'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
import * as history from '../data/history'
import {
  accessibilityElements,
  accessibilityIssues,
  canonicalChains,
  comparisonDiffs,
  comparisons,
  consoleErrors,
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
import { compareScans, getComparisonSummary, getDashboardSummary, processScanData } from '../process'

/**
 * Ensure dashboard data is processed (lazy processing)
 */
async function ensureProcessed(db: ReturnType<typeof history.getHistoryDb>, scanId: string) {
  const summary = getDashboardSummary(db, scanId)
  if (!summary) {
    await processScanData(db, scanId)
  }
}

/**
 * Create dashboard API routes for detailed category data
 */
export function createDashboardApi(outputPath: string): Router {
  const router = createRouter()

  // Get dashboard summary for a scan (auto-processes if not found)
  router.get('/summary/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }
    let summary = getDashboardSummary(db, scanId)
    // Auto-process if summary doesn't exist
    if (!summary) {
      const result = await processScanData(db, scanId)
      if (!result) {
        setResponseStatus(event, 404)
        return { error: 'Summary not found and no LHR data to process' }
      }
      summary = getDashboardSummary(db, scanId)
    }
    return summary
  }))

  // Process/reprocess dashboard data for a scan
  router.post('/process/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }
    const result = await processScanData(db, scanId)
    if (!result) {
      setResponseStatus(event, 404)
      return { error: 'No LHR data found for scan' }
    }
    return { success: true, summary: result }
  }))

  // ============================================================================
  // CrUX (field) data
  // ============================================================================

  router.get('/crux/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const rows = history.getScanCrux(outputPath, scanId)
    const empty = { lcp: [], inp: [], cls: [] }
    const result: { phone: typeof empty, desktop: typeof empty, hostname: string | null } = {
      phone: empty,
      desktop: empty,
      hostname: null,
    }
    for (const row of rows) {
      result.hostname = row.hostname
      const series = JSON.parse(row.seriesJson) as typeof empty
      if (row.formFactor === 'PHONE')
        result.phone = series
      else if (row.formFactor === 'DESKTOP')
        result.desktop = series
    }
    return result
  }))

  // ============================================================================
  // Performance Dashboard
  // ============================================================================

  router.get('/performance/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const { limit = '50' } = getQuery(event) as { limit?: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    await ensureProcessed(db, scanId)

    const issues = db.select().from(performanceIssues).where(eq(performanceIssues.scanId, scanId)).orderBy(desc(performanceIssues.wastedBytes)).limit(Number(limit)).all()

    const thirdParty = db.select().from(thirdPartyScripts).where(eq(thirdPartyScripts.scanId, scanId)).orderBy(desc(thirdPartyScripts.avgTbt)).all()

    const lcpData = db.select().from(lcpElements).where(eq(lcpElements.scanId, scanId)).orderBy(desc(lcpElements.pageCount)).all()

    // Get routes with CWV metrics
    const routes = db.select({
      path: scanRoutes.path,
      score: scanRoutes.performanceScore,
      lcp: scanRoutes.lcp,
      cls: scanRoutes.cls,
      tbt: scanRoutes.tbt,
      fcp: scanRoutes.fcp,
      si: scanRoutes.si,
      ttfb: scanRoutes.ttfb,
    }).from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

    return {
      issues: issues.map(i => ({ ...i, issueType: i.type, pages: JSON.parse(i.pages || '[]') })),
      thirdParty: thirdParty.map(t => ({ ...t, pages: JSON.parse(t.pages || '[]') })),
      lcpElements: lcpData.map(l => ({ ...l, pages: JSON.parse(l.pages || '[]') })),
      routes,
    }
  }))

  // ============================================================================
  // Accessibility Dashboard
  // ============================================================================

  router.get('/accessibility/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    await ensureProcessed(db, scanId)

    const issues = db.select().from(accessibilityIssues).where(eq(accessibilityIssues.scanId, scanId)).orderBy(desc(accessibilityIssues.instanceCount)).all()

    const elements = db.select().from(accessibilityElements).where(eq(accessibilityElements.scanId, scanId)).orderBy(desc(accessibilityElements.pageCount)).all()

    const altImages = db.select().from(missingAltImages).where(eq(missingAltImages.scanId, scanId)).orderBy(desc(missingAltImages.pageCount)).all()

    // Get routes with a11y scores
    const routes = db.select({
      path: scanRoutes.path,
      score: scanRoutes.accessibilityScore,
    }).from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

    return {
      issues: issues.map(i => ({
        ...i,
        wcagCriteria: JSON.parse(i.wcagCriteria || '[]'),
        pages: JSON.parse(i.pages || '[]'),
      })),
      elements: elements.map(e => ({
        ...e,
        boundingRect: e.boundingRect ? JSON.parse(e.boundingRect) : null,
        pages: JSON.parse(e.pages || '[]'),
      })),
      missingAltImages: altImages.map(a => ({ ...a, pages: JSON.parse(a.pages || '[]') })),
      routes,
    }
  }))

  // ============================================================================
  // Best Practices Dashboard
  // ============================================================================

  router.get('/best-practices/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    await ensureProcessed(db, scanId)

    const security = db.select().from(securityIssues).where(eq(securityIssues.scanId, scanId)).all()

    const libraries = db.select().from(detectedLibraries).where(eq(detectedLibraries.scanId, scanId)).orderBy(desc(detectedLibraries.pageCount)).all()

    const vulnerable = db.select().from(vulnerableLibraries).where(eq(vulnerableLibraries.scanId, scanId)).all()

    const deprecated = db.select().from(deprecatedApis).where(eq(deprecatedApis.scanId, scanId)).orderBy(desc(deprecatedApis.pageCount)).all()

    const errors = db.select().from(consoleErrors).where(eq(consoleErrors.scanId, scanId)).orderBy(desc(consoleErrors.instanceCount)).all()

    // Get routes with BP scores
    const routes = db.select({
      path: scanRoutes.path,
      score: scanRoutes.bestPracticesScore,
    }).from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

    return {
      securityIssues: security.map(s => ({
        ...s,
        details: JSON.parse(s.details || '{}'),
        pages: JSON.parse(s.pages || '[]'),
      })),
      libraries: libraries.map(l => ({ ...l, pages: JSON.parse(l.pages || '[]') })),
      vulnerableLibraries: vulnerable.map(v => ({
        ...v,
        highestSeverity: v.severity,
        cves: JSON.parse(v.cves || '[]'),
        pages: JSON.parse(v.pages || '[]'),
      })),
      deprecatedApis: deprecated.map(d => ({ ...d, pages: JSON.parse(d.pages || '[]') })),
      consoleErrors: errors.map(e => ({ ...e, pages: JSON.parse(e.pages || '[]') })),
      routes,
    }
  }))

  // ============================================================================
  // SEO Dashboard
  // ============================================================================

  router.get('/seo/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    await ensureProcessed(db, scanId)

    const meta = db.select().from(seoMeta).where(eq(seoMeta.scanId, scanId)).all()

    const duplicates = db.select().from(seoDuplicates).where(eq(seoDuplicates.scanId, scanId)).orderBy(desc(seoDuplicates.pageCount)).all()

    const chains = db.select().from(canonicalChains).where(eq(canonicalChains.scanId, scanId)).all()

    const linkText = db.select().from(linkTextIssues).where(eq(linkTextIssues.scanId, scanId)).orderBy(desc(linkTextIssues.instanceCount)).all()

    const tapTargets = db.select().from(tapTargetIssues).where(eq(tapTargetIssues.scanId, scanId)).all()

    // Get routes with SEO scores
    const routes = db.select({
      path: scanRoutes.path,
      score: scanRoutes.seoScore,
    }).from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()

    return {
      meta: meta.map(m => ({
        path: m.path,
        title: m.title,
        titleLength: m.titleLength,
        description: m.metaDescription,
        descriptionLength: m.metaDescriptionLength,
        canonical: m.canonical,
        ogTitle: m.ogTitle,
        ogDescription: m.ogDescription,
        ogImage: m.ogImage,
        hasOgTags: !!(m.ogTitle || m.ogDescription || m.ogImage),
        twitterCard: m.twitterCard,
        twitterTitle: m.twitterTitle,
        twitterDescription: m.twitterDescription,
        twitterImage: m.twitterImage,
        hasTwitterTags: !!(m.twitterCard || m.twitterTitle || m.twitterDescription),
        structuredDataTypes: JSON.parse(m.structuredDataTypes || '[]'),
        hreflangTags: JSON.parse(m.hreflangTags || '[]'),
        isIndexable: m.isIndexable,
      })),
      duplicates: duplicates.map(d => ({ ...d, pages: JSON.parse(d.pages || '[]') })),
      canonicalChains: chains.map(c => ({ ...c, pages: JSON.parse(c.pages || '[]') })),
      linkTextIssues: linkText.map(l => ({ ...l, pages: JSON.parse(l.pages || '[]') })),
      tapTargetIssues: tapTargets.map(t => ({ ...t, elements: JSON.parse(t.elements || '[]') })),
      routes,
    }
  }))

  // ============================================================================
  // Element Screenshot (cropped from fullPageScreenshot)
  // ============================================================================

  router.get('/screenshot/:scanId/:path', defineEventHandler((event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const decodedPath = decodeURIComponent(path)
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const routeRow = db.select({ lhrGzip: scanRoutes.lhrGzip, path: scanRoutes.path }).from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all().find(r => r.path === decodedPath || r.path === `/${decodedPath}`)

    if (!routeRow?.lhrGzip) {
      setResponseStatus(event, 404)
      return { error: 'Route or LHR data not found' }
    }

    const lhr = JSON.parse(gunzipSync(routeRow.lhrGzip).toString())
    const screenshotData = lhr.fullPageScreenshot?.screenshot?.data
    if (!screenshotData) {
      setResponseStatus(event, 404)
      return { error: 'No screenshot data in LHR' }
    }

    // screenshotData is "data:image/jpeg;base64,..." or just base64
    const base64 = screenshotData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')

    setResponseHeader(event, 'Content-Type', 'image/jpeg')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return buffer
  }))

  // ============================================================================
  // Individual route detail
  // ============================================================================

  router.get('/route/:scanId/:path', defineEventHandler((event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const decodedPath = decodeURIComponent(path)
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const route = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all().find(r => r.path === decodedPath || r.path === `/${decodedPath}`)

    if (!route) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }

    // Get SEO meta for this route
    const routeMeta = db.select().from(seoMeta).where(eq(seoMeta.scanId, scanId)).all().find(m => m.path === route.path)

    return {
      ...route,
      seoMeta: routeMeta
        ? {
            ...routeMeta,
            structuredDataTypes: JSON.parse(routeMeta.structuredDataTypes || '[]'),
            hreflangTags: JSON.parse(routeMeta.hreflangTags || '[]'),
          }
        : null,
    }
  }))

  // ============================================================================
  // Comparison (LHCI-style diffs between scans)
  // ============================================================================

  // Get a comparison by id, including per-route metric diffs
  router.get('/comparison/:id', defineEventHandler((event) => {
    const { id } = getRouterParams(event) as { id: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const summary = getComparisonSummary(db, Number(id))
    if (!summary) {
      setResponseStatus(event, 404)
      return { error: 'Comparison not found' }
    }
    return summary
  }))

  // List all comparisons involving a given scan (as base or current)
  router.get('/comparisons/:scanId', defineEventHandler((event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const rows = db.select().from(comparisons).where(or(eq(comparisons.baseScanId, scanId), eq(comparisons.currentScanId, scanId))).orderBy(desc(comparisons.createdAt)).all()
    return rows
  }))

  // Get the most recent comparison where scanId is the current side
  router.get('/comparison/latest/:scanId', defineEventHandler((event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const latest = db.select().from(comparisons).where(eq(comparisons.currentScanId, scanId)).orderBy(desc(comparisons.createdAt)).limit(1).get()

    if (!latest) {
      setResponseStatus(event, 404)
      return { error: 'No comparison found for scan' }
    }

    const diffs = db.select().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, latest.id)).all()

    return {
      ...latest,
      diffs: diffs.map(d => ({ ...d, metricDiffs: JSON.parse(d.metricDiffs) })),
    }
  }))

  // Create (or refresh) a comparison between two scans
  router.post('/compare/:baseScanId/:currentScanId', defineEventHandler(async (event) => {
    const { baseScanId, currentScanId } = getRouterParams(event) as { baseScanId: string, currentScanId: string }
    const db = history.getHistoryDb(outputPath)
    if (!db) {
      setResponseStatus(event, 500)
      return { error: 'Database not available' }
    }

    const base = db.select().from(scans).where(eq(scans.id, baseScanId)).get()
    const current = db.select().from(scans).where(eq(scans.id, currentScanId)).get()
    if (!base || !current) {
      setResponseStatus(event, 404)
      return { error: 'One or both scans not found' }
    }

    const comparison = await compareScans(db, baseScanId, currentScanId)
    return comparison
  }))

  return router
}
