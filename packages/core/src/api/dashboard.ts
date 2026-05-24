// Dashboard API — v2. Category-specific endpoints now read from pack reports
// (cached in pack_runs) instead of the removed aggregation tables.
// Endpoints kept for backward compatibility with the existing frontend.

import type { Storage } from '@unlighthouse/contracts'
import type { Router } from 'h3'
import { Buffer } from 'node:buffer'
import { createRouter, defineEventHandler, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
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
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const route = routes.find(r => r.path === decodedPath || r.path === norm)
    if (!route) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }

    // Try reconciled contract blob for rich audit data
    if (route.reportBlobKey) {
      const reportKey = route.reportBlobKey.replace('.json', '.contract.json')
      const blob = await storage.blobs.get(reportKey)
      if (blob) {
        const contract = JSON.parse(Buffer.from(blob).toString('utf-8'))
        return { ...route, ...contract }
      }
    }

    return route
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
