import type { Storage } from '@unlighthouse/contracts'
import type { Router } from 'h3'
import { Buffer } from 'node:buffer'
import { gunzipSync } from 'node:zlib'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
import { compareScans, getComparisonSummary } from '../comparison'
import { getDashboardSummary, processScanData } from '../report'

/**
 * Ensure dashboard data is processed (lazy processing).
 * For Storage adapters without a SQL handle, processScanData is a no-op
 * and the summary stays null — handlers degrade to "no data."
 */
async function ensureProcessed(storage: Storage, scanId: string) {
  const summary = await getDashboardSummary(storage, scanId)
  if (!summary)
    await processScanData(storage, scanId)
}

/**
 * Create dashboard API routes for detailed category data.
 *
 * Reads/writes through the v1 `Storage` port. The legacy `outputPath`-keyed
 * `getHistoryDb(outputPath)` is gone; LHR blobs come from `storage.blobs`,
 * detail tables from `storage.reports.*`.
 */
export function createDashboardApi(storage: Storage): Router {
  const router = createRouter()

  // Get dashboard summary for a scan (auto-processes if not found)
  router.get('/summary/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    let summary = await getDashboardSummary(storage, scanId)
    if (!summary) {
      const result = await processScanData(storage, scanId)
      if (!result) {
        setResponseStatus(event, 404)
        return { error: 'Summary not found and no LHR data to process' }
      }
      summary = await getDashboardSummary(storage, scanId)
    }
    return summary
  }))

  router.post('/process/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const result = await processScanData(storage, scanId)
    if (!result) {
      setResponseStatus(event, 404)
      return { error: 'No LHR data found for scan' }
    }
    return { success: true, summary: result }
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // CrUX (field) data
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/crux/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const rows = await storage.reports.crux.list(scanId as never) as Array<{
      hostname: string
      formFactor: 'PHONE' | 'DESKTOP'
      seriesJson: string
    }>
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

  // ──────────────────────────────────────────────────────────────────────────
  // Performance Dashboard
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/performance/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const { limit = '50' } = getQuery(event) as { limit?: string }
    await ensureProcessed(storage, scanId)

    const issues = (await storage.reports.performance.list(scanId as never)).slice(0, Number(limit)) as Array<{ type: string, pages: string | null, [k: string]: unknown }>
    const thirdParty = await storage.reports.thirdPartyScripts.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>
    const lcpData = await storage.reports.lcpElements.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>

    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path,
      score: r.scorePerformance,
      lcp: r.lcp,
      cls: r.cls,
      tbt: r.tbt,
      fcp: r.fcp,
      si: r.si,
      ttfb: r.ttfb,
    }))

    return {
      issues: issues.map(i => ({ ...i, issueType: i.type, pages: JSON.parse((i.pages as string) || '[]') })),
      thirdParty: thirdParty.map(t => ({ ...t, pages: JSON.parse((t.pages as string) || '[]') })),
      lcpElements: lcpData.map(l => ({ ...l, pages: JSON.parse((l.pages as string) || '[]') })),
      routes,
    }
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // Accessibility Dashboard
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/accessibility/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    await ensureProcessed(storage, scanId)

    const issues = await storage.reports.accessibility.list(scanId as never) as Array<{ wcagCriteria: string | null, pages: string | null, [k: string]: unknown }>
    const elements = await storage.reports.accessibilityElements.list(scanId as never) as Array<{ boundingRect: string | null, pages: string | null, [k: string]: unknown }>
    const altImages = await storage.reports.missingAltImages.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>

    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path,
      score: r.scoreAccessibility,
    }))

    return {
      issues: issues.map(i => ({
        ...i,
        wcagCriteria: JSON.parse((i.wcagCriteria as string) || '[]'),
        pages: JSON.parse((i.pages as string) || '[]'),
      })),
      elements: elements.map(e => ({
        ...e,
        boundingRect: e.boundingRect ? JSON.parse(e.boundingRect) : null,
        pages: JSON.parse((e.pages as string) || '[]'),
      })),
      missingAltImages: altImages.map(a => ({ ...a, pages: JSON.parse((a.pages as string) || '[]') })),
      routes,
    }
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // Best Practices Dashboard
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/best-practices/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    await ensureProcessed(storage, scanId)

    const security = await storage.reports.bestPracticesSecurity.list(scanId as never) as Array<{ details: string | null, pages: string | null, [k: string]: unknown }>
    const libraries = await storage.reports.bestPracticesLibraries.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>
    const vulnerable = await storage.reports.bestPracticesVulnerable.list(scanId as never) as Array<{ severity: string, cves: string | null, pages: string | null, [k: string]: unknown }>
    const deprecated = await storage.reports.bestPracticesDeprecated.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>
    const errors = await storage.reports.bestPracticesConsoleErrors.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>

    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path,
      score: r.scoreBestPractices,
    }))

    return {
      securityIssues: security.map(s => ({
        ...s,
        details: JSON.parse((s.details as string) || '{}'),
        pages: JSON.parse((s.pages as string) || '[]'),
      })),
      libraries: libraries.map(l => ({ ...l, pages: JSON.parse((l.pages as string) || '[]') })),
      vulnerableLibraries: vulnerable.map(v => ({
        ...v,
        highestSeverity: v.severity,
        cves: JSON.parse((v.cves as string) || '[]'),
        pages: JSON.parse((v.pages as string) || '[]'),
      })),
      deprecatedApis: deprecated.map(d => ({ ...d, pages: JSON.parse((d.pages as string) || '[]') })),
      consoleErrors: errors.map(e => ({ ...e, pages: JSON.parse((e.pages as string) || '[]') })),
      routes,
    }
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // SEO Dashboard
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/seo/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    await ensureProcessed(storage, scanId)

    const meta = await storage.reports.seoMeta.list(scanId as never) as Array<{
      path: string
      title: string | null
      titleLength: number | null
      metaDescription: string | null
      metaDescriptionLength: number | null
      canonical: string | null
      ogTitle: string | null
      ogDescription: string | null
      ogImage: string | null
      twitterCard: string | null
      twitterTitle: string | null
      twitterDescription: string | null
      twitterImage: string | null
      structuredDataTypes: string | null
      hreflangTags: string | null
      isIndexable: boolean | null
    }>
    const duplicates = await storage.reports.seoDuplicates.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>
    const chains = await storage.reports.canonicalChains.list(scanId as never) as Array<{ pages: string, [k: string]: unknown }>
    const linkText = await storage.reports.linkTextIssues.list(scanId as never) as Array<{ pages: string | null, [k: string]: unknown }>
    const tapTargets = await storage.reports.tapTargetIssues.list(scanId as never) as Array<{ elements: string | null, [k: string]: unknown }>

    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path,
      score: r.scoreSeo,
    }))

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
      duplicates: duplicates.map(d => ({ ...d, pages: JSON.parse((d.pages as string) || '[]') })),
      canonicalChains: chains.map(c => ({ ...c, pages: JSON.parse(c.pages || '[]') })),
      linkTextIssues: linkText.map(l => ({ ...l, pages: JSON.parse((l.pages as string) || '[]') })),
      tapTargetIssues: tapTargets.map(t => ({ ...t, elements: JSON.parse(t.elements || '[]') })),
      routes,
    }
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // Element Screenshot (cropped from fullPageScreenshot in the LHR blob)
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/screenshot/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const route = routes.find(r => r.path === decodedPath || r.path === norm)
    if (!route?.lhrBlobKey) {
      setResponseStatus(event, 404)
      return { error: 'Route or LHR data not found' }
    }

    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz) {
      setResponseStatus(event, 404)
      return { error: 'LHR blob missing' }
    }
    const lhr = JSON.parse(gunzipSync(gz).toString())
    const screenshotData = lhr.fullPageScreenshot?.screenshot?.data
    if (!screenshotData) {
      setResponseStatus(event, 404)
      return { error: 'No screenshot data in LHR' }
    }

    const base64 = screenshotData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    setResponseHeader(event, 'Content-Type', 'image/jpeg')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    return buffer
  }))

  // ──────────────────────────────────────────────────────────────────────────
  // Individual route detail
  // ──────────────────────────────────────────────────────────────────────────

  router.get('/route/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const route = routes.find(r => r.path === decodedPath || r.path === norm)
    if (!route) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }

    const seoMetaRows = await storage.reports.seoMeta.list(scanId as never) as Array<{ path: string, structuredDataTypes: string | null, hreflangTags: string | null, [k: string]: unknown }>
    const routeMeta = seoMetaRows.find(m => m.path === route.path)

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

  // ──────────────────────────────────────────────────────────────────────────
  // Comparison (LHCI-style diffs between scans)
  // ──────────────────────────────────────────────────────────────────────────

  const requireSqlDb = () => {
    const db = (storage as { db?: any }).db
    return db ?? null
  }

  router.get('/comparison/:id', defineEventHandler(async (event) => {
    const { id } = getRouterParams(event) as { id: string }
    const db = requireSqlDb()
    if (!db) {
      setResponseStatus(event, 501)
      return { error: 'Comparisons not available on this storage adapter' }
    }
    const summary = await getComparisonSummary(db, Number(id))
    if (!summary) {
      setResponseStatus(event, 404)
      return { error: 'Comparison not found' }
    }
    return summary
  }))

  router.get('/comparisons/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    // Drizzle impl exposes `listInvolvingScan`; cloudflare/memory return [].
    const repo = storage.comparisons as typeof storage.comparisons & {
      listInvolvingScan?: (scanId: string) => Promise<unknown[]>
    }
    if (repo.listInvolvingScan)
      return await repo.listInvolvingScan(scanId)
    return await storage.comparisons.list({ currentScanId: scanId as never })
  }))

  router.get('/comparison/latest/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const latest = await storage.comparisons.latestForCurrent(scanId as never) as
      | { id: number, diffs: Array<{ metricDiffs: string, [k: string]: unknown }> }
      | null
    if (!latest) {
      setResponseStatus(event, 404)
      return { error: 'No comparison found for scan' }
    }
    return {
      ...latest,
      diffs: latest.diffs.map(d => ({ ...d, metricDiffs: JSON.parse(d.metricDiffs) })),
    }
  }))

  router.post('/compare/:baseScanId/:currentScanId', defineEventHandler(async (event) => {
    const { baseScanId, currentScanId } = getRouterParams(event) as { baseScanId: string, currentScanId: string }
    const db = requireSqlDb()
    if (!db) {
      setResponseStatus(event, 501)
      return { error: 'Comparisons not available on this storage adapter' }
    }

    const base = await storage.scans.get(baseScanId as never)
    const current = await storage.scans.get(currentScanId as never)
    if (!base || !current) {
      setResponseStatus(event, 404)
      return { error: 'One or both scans not found' }
    }

    return await compareScans(db, baseScanId, currentScanId)
  }))

  return router
}
