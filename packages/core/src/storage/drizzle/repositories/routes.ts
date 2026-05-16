import type {
  Device,
  ExtractedMetrics,
  Paginated,
  RouteListQuery,
  ScanId,
  ScanRoute,
  ScanRouteRepository,
} from '@unlighthouse/contracts'
import type { ScanRouteRow } from '@unlighthouse/contracts/drizzle'
import { createHash } from 'node:crypto'
import { scanRoutes } from '@unlighthouse/contracts/drizzle'
import { and, eq, sql } from 'drizzle-orm'

type AnyDrizzle = any

const DEFAULT_PAGE_SIZE = 100

function urlHash(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16)
}

// D-029: blob keys are per (scanId, url, device). The device segment is
// appended to the filename so mobile + desktop rows for the same URL each
// own their own blob under a deterministic key.
function blobKeyFor(scanId: string, url: string, device: Device): string {
  return `scans/${scanId}/lhr/${urlHash(url)}-${device}.json.gz`
}

export function reportBlobKeyFor(scanId: string, url: string, device: Device = 'mobile'): string {
  return `scans/${scanId}/reports/${urlHash(url)}-${device}.json`
}

function metricsToRow(scanId: string, device: Device, m: ExtractedMetrics) {
  return {
    scanId,
    url: m.url,
    device,
    path: m.path,
    routeName: m.routeName,
    scorePerformance: m.scorePerformance,
    scoreAccessibility: m.scoreAccessibility,
    scoreSeo: m.scoreSeo,
    scoreBestPractices: m.scoreBestPractices,
    lcp: m.lcp,
    cls: m.cls,
    inp: m.inp,
    fcp: m.fcp,
    ttfb: m.ttfb,
    tbt: m.tbt,
    si: m.si,
    lighthouseVersion: m.lighthouseVersion,
    capturedAt: m.capturedAt,
    lhrBlobKey: blobKeyFor(scanId, m.url, device),
    reportBlobKey: reportBlobKeyFor(scanId, m.url, device),
  }
}

function rowToRoute(row: ScanRouteRow): ScanRoute {
  return row as unknown as ScanRoute
}

export function createScanRouteRepository(db: AnyDrizzle): ScanRouteRepository {
  return {
    async putBatch(scanId: ScanId, device: Device, rows: ExtractedMetrics[]): Promise<void> {
      if (rows.length === 0)
        return
      const values = rows.map(m => metricsToRow(scanId, device, m))
      // Iterate per-row upsert. better-sqlite3's drizzle binding requires sync
      // transaction callbacks (no Promise return), so portability across the
      // async drivers (libsql/D1) precludes a transactional wrapper here. Each
      // upsert is atomic at the row level; partial failure within a batch is
      // acceptable for the single-writer scan workflow.
      for (const v of values) {
        const { scanId: _s, url: _u, device: _d, ...patch } = v
        await db
          .insert(scanRoutes)
          .values(v)
          .onConflictDoUpdate({
            target: [scanRoutes.scanId, scanRoutes.url, scanRoutes.device],
            set: patch,
          })
      }
    },

    async upsert(scanId: ScanId, device: Device, row: ExtractedMetrics): Promise<void> {
      const v = metricsToRow(scanId, device, row)
      const { scanId: _s, url: _u, device: _d, ...patch } = v
      await db
        .insert(scanRoutes)
        .values(v)
        .onConflictDoUpdate({
          target: [scanRoutes.scanId, scanRoutes.url, scanRoutes.device],
          set: patch,
        })
    },

    async listForScan(scanId: ScanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> {
      const page = Math.max(1, q?.page ?? 1)
      const pageSize = Math.max(1, q?.pageSize ?? DEFAULT_PAGE_SIZE)
      const offset = (page - 1) * pageSize

      const where = q?.device
        ? and(eq(scanRoutes.scanId, scanId), eq(scanRoutes.device, q.device))
        : eq(scanRoutes.scanId, scanId)

      const rows = await db
        .select()
        .from(scanRoutes)
        .where(where)
        .limit(pageSize)
        .offset(offset)

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(scanRoutes)
        .where(where)

      return {
        items: rows.map(rowToRoute),
        total: count,
        page,
        pageSize,
      }
    },

    async get(scanId: ScanId, url: string, device: Device): Promise<ScanRoute | null> {
      const [row] = await db
        .select()
        .from(scanRoutes)
        .where(and(
          eq(scanRoutes.scanId, scanId),
          eq(scanRoutes.url, url),
          eq(scanRoutes.device, device),
        ))
        .limit(1)
      return row ? rowToRoute(row) : null
    },

    async delete(scanId: ScanId, url?: string, device?: Device): Promise<void> {
      let where
      if (url && device) {
        where = and(
          eq(scanRoutes.scanId, scanId),
          eq(scanRoutes.url, url),
          eq(scanRoutes.device, device),
        )
      }
      else if (url) {
        where = and(eq(scanRoutes.scanId, scanId), eq(scanRoutes.url, url))
      }
      else {
        where = eq(scanRoutes.scanId, scanId)
      }
      await db.delete(scanRoutes).where(where)
    },
  }
}
