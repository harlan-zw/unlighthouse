import type { Router } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseStatus } from 'h3'
import * as history from '../data/history'
import {
  accessibilityElements,
  accessibilityIssues,
  canonicalChains,
  consoleErrors,
  deprecatedApis,
  detectedLibraries,
  lcpElements,
  linkTextIssues,
  missingAltImages,
  performanceIssues,
  scanRoutes,
  securityIssues,
  seoDuplicates,
  seoMeta,
  tapTargetIssues,
  thirdPartyScripts,
  vulnerableLibraries,
} from '../data/history/schema'
import { getDashboardSummary, processScanData } from '../process'

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
      issues: issues.map(i => ({ ...i, pages: JSON.parse(i.pages || '[]') })),
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
      elements: elements.map(e => ({ ...e, pages: JSON.parse(e.pages || '[]') })),
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

  return router
}
