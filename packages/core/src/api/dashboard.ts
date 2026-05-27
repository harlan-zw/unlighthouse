// Dashboard API — v2. Category-specific endpoints now read from pack reports
// (cached in pack_runs) instead of the removed aggregation tables.
// Endpoints kept for backward compatibility with the existing frontend.

import type { Storage } from '@unlighthouse/contracts'
import type { Router } from 'h3'
import { Buffer } from 'node:buffer'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
import { getComparisonSummary } from '../comparison'
import { createTaggedLogger } from '../logger'

const log = createTaggedLogger('dashboard')

async function getPackReport(storage: Storage, scanId: string, packName: string): Promise<unknown | null> {
  const runs = await storage.packRuns.listForScan(scanId as never)
  const run = runs.find(r => r.packName === packName)
  return run?.report ?? null
}

export function createDashboardApi(storage: Storage): Router {
  const router = createRouter()

  router.get('/summary/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const overview = await getPackReport(storage, scanId, 'overview')
    if (!overview) {
      setResponseStatus(event, 404)
      return { error: 'Summary not found — scan may still be in progress' }
    }
    return overview
  }))

  router.get('/manifest/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const bytes = await storage.blobs.get(`scans/${scanId}/manifest.json`)
    if (!bytes) {
      setResponseStatus(event, 404)
      return { error: 'Manifest not found' }
    }
    setResponseHeader(event, 'content-type', 'application/json')
    return JSON.parse(Buffer.from(bytes).toString('utf-8'))
  }))

  router.post('/process/:scanId', defineEventHandler(async (_event) => {
    return { success: true, summary: null }
  }))

  // CrUX field data (reads from scan_crux table — not removed)
  router.get('/crux/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const rows = await storage.reports.crux.list(scanId as never) as Array<{
      hostname: string
      formFactor: 'PHONE' | 'DESKTOP'
      seriesJson: string
    }>
    const empty = { lcp: [], inp: [], cls: [] }
    const result: { phone: typeof empty, desktop: typeof empty, hostname: string | null } = {
      phone: { ...empty },
      desktop: { ...empty },
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

  // Category dashboards — now read from pack reports
  router.get('/performance/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const cwv = await getPackReport(storage, scanId, 'cwv')
    const insights = await getPackReport(storage, scanId, 'insights')
    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path, score: r.scorePerformance,
      lcp: r.lcp, cls: r.cls, tbt: r.tbt, fcp: r.fcp, si: r.si, ttfb: r.ttfb,
    }))
    return { cwv, insights, routes, issues: [], thirdParty: [], lcpElements: [] }
  }))

  router.get('/accessibility/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const a11y = await getPackReport(storage, scanId, 'a11y-quick-wins')
    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path, score: r.scoreAccessibility,
    }))
    return { a11y, routes, issues: [], elements: [], missingAltImages: [] }
  }))

  router.get('/best-practices/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path, score: r.scoreBestPractices,
    }))
    return { routes, securityIssues: [], libraries: [], vulnerableLibraries: [], deprecatedApis: [], consoleErrors: [] }
  }))

  router.get('/seo/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const seo = await getPackReport(storage, scanId, 'seo-basics')
    const routes = (await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })).items.map(r => ({
      path: r.path, score: r.scoreSeo,
    }))
    return { seo, routes, meta: [], duplicates: [], canonicalChains: [], linkTextIssues: [], tapTargetIssues: [] }
  }))

  // Screenshot — try dedicated blob first, fall back to LHR extraction
  router.get('/screenshot/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const route = routes.find(r => r.path === decodedPath || r.path === norm)
    if (!route) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }

    // Try dedicated screenshot blob first
    if (route.screenshotBlobKey) {
      const blob = await storage.blobs.get(route.screenshotBlobKey)
      if (blob) {
        setResponseHeader(event, 'Content-Type', 'image/webp')
        setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
        return Buffer.from(blob)
      }
    }

    // Fall back to LHR extraction
    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz) {
      setResponseStatus(event, 404)
      return { error: 'No screenshot data' }
    }
    const { gunzipSync } = await import('node:zlib')
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

  // Route detail — reads from reconciled contract blob
  router.get('/route/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const { device } = getQuery(event) as { device?: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    // Match on path; honor an explicit ?device= so a route audited on both
    // mobile + desktop returns the requested side instead of whichever
    // listForScan happened to return first. Surface all matching devices so
    // the UI can show a toggle without a second round-trip.
    const matches = routes.filter(r => r.path === decodedPath || r.path === norm)
    if (matches.length === 0) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }
    const devices = Array.from(new Set(matches.map(r => r.device))).sort()
    const route = (device && matches.find(r => r.device === device)) || matches[0]

    // Try reconciled contract blob for rich audit data
    if (route.reportBlobKey) {
      const reportKey = route.reportBlobKey.replace('.json', '.contract.json')
      const blob = await storage.blobs.get(reportKey)
      if (blob) {
        const contract = JSON.parse(Buffer.from(blob).toString('utf-8'))
        return { ...route, ...contract, availableDevices: devices }
      }
    }

    return { ...route, availableDevices: devices }
  }))

  // Raw Lighthouse JSON — gunzipped and served as application/json so
  // power users can drop it into the official LH report viewer, parse it
  // with custom tooling, or attach it to a bug report. Honors ?device=
  // the same way /route does. Cached aggressively because the blob is
  // immutable for the life of the scan.
  router.get('/lhr/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const { device } = getQuery(event) as { device?: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const matches = routes.filter(r => r.path === decodedPath || r.path === norm)
    const route = (device && matches.find(r => r.device === device)) || matches[0]
    if (!route || !route.lhrBlobKey) {
      setResponseStatus(event, 404)
      return { error: 'No LHR data for this route' }
    }
    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz) {
      setResponseStatus(event, 404)
      return { error: 'LHR blob missing from storage' }
    }
    const { gunzipSync } = await import('node:zlib')
    const json = gunzipSync(gz).toString('utf-8')
    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    // Hint to the browser to save as a file when opened via the download
    // button rather than rendering. Filename pins the device so a user
    // who saves both copies doesn't overwrite the first.
    const safeName = `${scanId}-${route.device}-${route.path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.lhr.json`
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${safeName}"`)
    return json
  }))

  // Full-scan export — bundles the scan record + every route's metadata +
  // every route's reconciled contract blob + all pack runs into a single
  // self-contained JSON. Lets users archive a scan, share it offline, or
  // feed it into downstream tooling without holding the dashboard open.
  // Deliberately omits raw LHR blobs (they're megabytes each and already
  // downloadable individually via /dashboard/lhr/:scanId/:path).
  router.get('/export/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const scan = await storage.scans.get(scanId as never)
    if (!scan) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })

    // Hydrate each route with its reconciled contract blob. Routes without
    // a blob (imported scans that didn't carry LHR data) stay {contract:
    // null} so the consumer can distinguish "no data" from "data lost".
    const hydratedRoutes = await Promise.all(routes.map(async (r) => {
      let contract: unknown = null
      if (r.reportBlobKey) {
        const blob = await storage.blobs.get(r.reportBlobKey.replace('.json', '.contract.json'))
        if (blob) {
          try { contract = JSON.parse(Buffer.from(blob).toString('utf-8')) }
          catch { /* leave null */ }
        }
      }
      return { ...r, contract }
    }))

    const packRuns = await storage.packRuns.listForScan(scanId as never).catch(() => [])

    const payload = {
      // Schema version so downstream tooling can guard against format
      // changes. Bump when the wire shape changes incompatibly.
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      scan,
      routes: hydratedRoutes,
      packRuns,
    }

    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    const safeName = `${scanId}-export.json`
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${safeName}"`)
    return payload
  }))

  // Comparison endpoints
  const requireSqlDb = () => (storage as { db?: any }).db ?? null

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

  return router
}
