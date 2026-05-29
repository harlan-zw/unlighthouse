// Dashboard blob/binary-serve endpoints — kept on a separate router
// from the typed command surface because they serve raw binaries
// (screenshots, LHR JSON, scan exports) keyed on `(scanId, path)`
// rather than a command input. The command-derived /api/* router can't
// produce a Buffer / Content-Disposition response cleanly; this is the
// escape hatch.
//
// Only 4 endpoints live here: screenshot, route, lhr, export. The 11
// v0-era category/comparison endpoints (`/performance`, `/accessibility`,
// `/best-practices`, `/seo`, `/crux`, `/summary`, `/manifest`,
// `/process`, `/comparison/*`) were removed in R1 — the new dashboard
// reads everything through `pack.run` and `compare.detail` / `compare.run`
// instead. If you're tempted to add a new endpoint here, ask whether a
// typed command would do.

import type { Storage } from '@unlighthouse/contracts'
import type { Router } from 'h3'
import { Buffer } from 'node:buffer'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
import { createTaggedLogger } from '../logger'

const log = createTaggedLogger('dashboard')
log.debug('init')

export function createDashboardApi(storage: Storage): Router {
  const router = createRouter()

  // Screenshot — try the dedicated screenshot blob first, fall back to
  // the fullPageScreenshot embedded in the LHR (older scans + the mock
  // auditor don't write a separate webp file).
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

    if (route.screenshotBlobKey) {
      const blob = await storage.blobs.get(route.screenshotBlobKey)
      if (blob) {
        setResponseHeader(event, 'Content-Type', 'image/webp')
        setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
        return Buffer.from(blob)
      }
    }

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

  // Route detail — reads from reconciled contract blob. Surfaces both
  // sides of a multi-device scan via `availableDevices` so the UI can
  // render a device toggle without a second probe call.
  //
  // The typed `route.get` command serves the same data; this endpoint
  // remains because the UI currently calls it directly with the
  // (scanId, path) URL params — switching the route detail page over
  // is R2.
  router.get('/route/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const { device } = getQuery(event) as { device?: string }
    const decodedPath = decodeURIComponent(path)
    const norm = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    const matches = routes.filter(r => r.path === decodedPath || r.path === norm)
    if (matches.length === 0) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }
    const devices = Array.from(new Set(matches.map(r => r.device))).sort()
    const route = (device && matches.find(r => r.device === device)) || matches[0]

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

  // Raw Lighthouse JSON — gunzipped, served as application/json with
  // Content-Disposition so the browser saves it as a file. Power users
  // want this for the official LH report viewer + custom downstream
  // tooling.
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
    const safeName = `${scanId}-${route.device}-${route.path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.lhr.json`
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${safeName}"`)
    return json
  }))

  // Full-scan export — bundles the scan record + every route + every
  // route's reconciled contract blob + all pack runs into a single
  // self-contained JSON. Lets operators archive, share offline, or
  // feed into downstream tooling. Raw LHRs deliberately omitted (MBs
  // each; downloadable individually via /lhr/...).
  router.get('/export/:scanId', defineEventHandler(async (event) => {
    const { scanId } = getRouterParams(event) as { scanId: string }
    const scan = await storage.scans.get(scanId as never)
    if (!scan) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }

    const { items: routes } = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })

    // CSV projection — flat per-route rows for spreadsheets / Sheets (#141,
    // #135). Scores as 0–100 integers, CWV metrics raw, blank for nulls.
    // Skips the expensive contract/LHR hydration the JSON export does.
    const format = String((getQuery(event) as { format?: string }).format ?? 'json').toLowerCase()
    if (format === 'csv') {
      const cols = ['path', 'url', 'device', 'performance', 'accessibility', 'seo', 'bestPractices', 'agenticBrowsing', 'lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si', 'capturedAt']
      const pct = (v: number | null | undefined): string => v == null ? '' : String(Math.round(v * 100))
      const num = (v: number | null | undefined): string => v == null ? '' : String(v)
      const esc = (v: unknown): string => {
        const s = String(v ?? '')
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const lines = routes.map(r => [
        r.path, r.url, r.device,
        pct(r.scorePerformance), pct(r.scoreAccessibility), pct(r.scoreSeo), pct(r.scoreBestPractices), pct(r.scoreAgenticBrowsing),
        num(r.lcp), num(r.cls), num(r.inp), num(r.fcp), num(r.ttfb), num(r.tbt), num(r.si),
        r.capturedAt,
      ].map(esc).join(','))
      const csv = `${[cols.join(','), ...lines].join('\n')}\n`
      setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
      setResponseHeader(event, 'Content-Disposition', `attachment; filename="${scanId}-export.csv"`)
      return csv
    }

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

  return router
}
