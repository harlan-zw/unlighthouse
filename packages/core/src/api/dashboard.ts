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

import type { BlobStore, Logger, Storage } from '@unlighthouse/contracts'
import type { ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { Router } from 'h3'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { createRouter, defineEventHandler, getQuery, getRouterParams, setResponseHeader, setResponseStatus } from 'h3'
import { loadRouteContract } from '../report/route-contracts'
import { base64ToBytes } from '../util/base64'
import { gunzipToString } from '../util/gzip'

interface DashboardRouteMatch {
  route: ScanRoute
  availableDevices: string[]
}

async function findDashboardRoute(storage: Storage, scanId: string, path: string, device?: string): Promise<DashboardRouteMatch | null> {
  const decodedPath = decodeURIComponent(path)
  const normalisedPath = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`
  const parsedScanId = parseScanId(scanId)
  let matches = await storage.routes.findByPath(parsedScanId, normalisedPath)
  if (matches.length === 0 && decodedPath !== normalisedPath)
    matches = await storage.routes.findByPath(parsedScanId, decodedPath)
  if (matches.length === 0)
    return null

  const fallbackRoute = matches[0]
  if (!fallbackRoute)
    return null
  const route = (device && matches.find(route => route.device === device)) || fallbackRoute
  return {
    route,
    availableDevices: Array.from(new Set(matches.map(route => route.device))).sort(),
  }
}

const EXPORT_PAGE_SIZE = 50
const EXPORT_HYDRATION_CONCURRENCY = 8
const textEncoder = new TextEncoder()

async function* routePages(storage: Storage, scanId: ScanId): AsyncGenerator<ScanRoute[]> {
  let page = 1
  while (true) {
    const result = await storage.routes.listForScan(scanId, { page, pageSize: EXPORT_PAGE_SIZE })
    if (result.items.length === 0)
      return
    yield result.items
    if (page * EXPORT_PAGE_SIZE >= result.total)
      return
    page++
  }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const output = Array.from<R>({ length: items.length })
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      const item = items[index]
      if (item !== undefined)
        output[index] = await map(item)
    }
  })
  await Promise.all(workers)
  return output
}

function textStream(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next()
      if (next.done) {
        controller.close()
        return
      }
      controller.enqueue(textEncoder.encode(next.value))
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

async function blobDownload(blobs: BlobStore, key: string): Promise<Uint8Array | ReadableStream<Uint8Array> | null> {
  const stream = await blobs.getStream?.(key)
  return stream ?? blobs.get(key)
}

export function createDashboardApi(storage: Storage, logger?: Logger): Router {
  const log = logger?.withTag('dashboard')
  const router = createRouter()

  // Screenshot — try the dedicated screenshot blob first, fall back to
  // the fullPageScreenshot embedded in the LHR (older scans + the mock
  // auditor don't write a separate webp file).
  router.get('/screenshot/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const { device } = getQuery(event) as { device?: string }
    const match = await findDashboardRoute(storage, scanId, path, device)
    // In a multi-device scan the same path has a mobile and a desktop row; honour
    // an explicit `?device=` so the UI can show the screenshot for the device the
    // user picked, falling back to the first capture for that path.
    if (!match) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }
    const { route } = match

    if (route.screenshotBlobKey) {
      const blob = await blobDownload(storage.blobs, route.screenshotBlobKey)
      if (blob) {
        setResponseHeader(event, 'Content-Type', 'image/webp')
        setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
        return blob
      }
    }

    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz) {
      setResponseStatus(event, 404)
      return { error: 'No screenshot data' }
    }
    const lhr = JSON.parse(gunzipToString(gz))
    const screenshotData = lhr.fullPageScreenshot?.screenshot?.data
    if (!screenshotData) {
      setResponseStatus(event, 404)
      return { error: 'No screenshot data in LHR' }
    }
    const base64 = screenshotData.replace(/^data:image\/\w+;base64,/, '')
    const buffer = base64ToBytes(base64)
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
    const match = await findDashboardRoute(storage, scanId, path, device)
    if (!match) {
      setResponseStatus(event, 404)
      return { error: 'Route not found' }
    }
    const { route, availableDevices } = match

    const contract = await loadRouteContract(storage.blobs, route)
    if (contract)
      return { ...route, ...contract, availableDevices }
    return { ...route, availableDevices }
  }))

  // Raw Lighthouse JSON — gunzipped, served as application/json with
  // Content-Disposition so the browser saves it as a file. Power users
  // want this for the official LH report viewer + custom downstream
  // tooling.
  router.get('/lhr/:scanId/:path', defineEventHandler(async (event) => {
    const { scanId, path } = getRouterParams(event) as { scanId: string, path: string }
    const { device } = getQuery(event) as { device?: string }
    const route = (await findDashboardRoute(storage, scanId, path, device))?.route
    if (!route || !route.lhrBlobKey) {
      setResponseStatus(event, 404)
      return { error: 'No LHR data for this route' }
    }
    const gzStream = await storage.blobs.getStream?.(route.lhrBlobKey)
    if (gzStream) {
      setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
      setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
      const safeName = `${scanId}-${route.device}-${route.path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root'}.lhr.json`
      setResponseHeader(event, 'Content-Disposition', `attachment; filename="${safeName}"`)
      // lib.dom currently types DecompressionStream.writable as BufferSource,
      // while ReadableStream.pipeThrough expects the narrower Uint8Array shape.
      // Runtime streams are byte-compatible; keep the cast at this platform seam.
      const decompressor = new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
      return gzStream.pipeThrough(decompressor)
    }
    const gz = await storage.blobs.get(route.lhrBlobKey)
    if (!gz) {
      setResponseStatus(event, 404)
      return { error: 'LHR blob missing from storage' }
    }
    const json = gunzipToString(gz)
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
    const parsedScanId = parseScanId(scanId)
    const scan = await storage.scans.get(parsedScanId)
    if (!scan) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }

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
      setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
      setResponseHeader(event, 'Content-Disposition', `attachment; filename="${scanId}-export.csv"`)
      async function* csvChunks() {
        yield `${cols.join(',')}\n`
        for await (const routes of routePages(storage, parsedScanId)) {
          for (const r of routes) {
            yield `${[
              r.path,
              r.url,
              r.device,
              pct(r.scorePerformance),
              pct(r.scoreAccessibility),
              pct(r.scoreSeo),
              pct(r.scoreBestPractices),
              pct(r.scoreAgenticBrowsing),
              num(r.lcp),
              num(r.cls),
              num(r.inp),
              num(r.fcp),
              num(r.ttfb),
              num(r.tbt),
              num(r.si),
              r.capturedAt,
            ].map(esc).join(',')}\n`
          }
        }
      }
      return textStream(csvChunks())
    }

    setResponseHeader(event, 'Content-Type', 'application/json; charset=utf-8')
    const safeName = `${scanId}-export.json`
    setResponseHeader(event, 'Content-Disposition', `attachment; filename="${safeName}"`)
    async function* jsonChunks() {
      yield `{"exportVersion":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"scan":${JSON.stringify(scan)},"routes":[`
      let first = true
      for await (const routes of routePages(storage, parsedScanId)) {
        const hydrated = await mapConcurrent(routes, EXPORT_HYDRATION_CONCURRENCY, async route => ({
          ...route,
          contract: await loadRouteContract(storage.blobs, route),
        }))
        for (const route of hydrated) {
          yield `${first ? '' : ','}${JSON.stringify(route)}`
          first = false
        }
      }
      const packRuns = await storage.packRuns.listForScan(parsedScanId).catch((err) => {
        logOperationalWarn('dashboard.pack_runs_read_failed', err, { scanId: parsedScanId }, log)
        return []
      })
      yield `],"packRuns":${JSON.stringify(packRuns)}}`
    }
    return textStream(jsonChunks())
  }))

  return router
}
