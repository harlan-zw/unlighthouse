import type {
  ExtractedMetrics,
  Paginated,
  RouteListQuery,
  ScanId,
  ScanRoute,
  ScanRouteRepository,
} from '@unlighthouse/contracts'
import type { ScanRouteRow } from '../schema/sqlite'
import { createHash } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { scanRoutes } from '../schema/sqlite'

type AnyDrizzle = any

const DEFAULT_PAGE_SIZE = 100

function urlHash(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16)
}

function blobKeyFor(scanId: string, url: string): string {
  return `scans/${scanId}/lhr/${urlHash(url)}.json.gz`
}

function metricsToRow(scanId: string, m: ExtractedMetrics) {
  return {
    scanId,
    url: m.url,
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
    lhrBlobKey: blobKeyFor(scanId, m.url),
  }
}

function rowToRoute(row: ScanRouteRow): ScanRoute {
  return row as unknown as ScanRoute
}

export function createScanRouteRepository(db: AnyDrizzle): ScanRouteRepository {
  return {
    async putBatch(scanId: ScanId, rows: ExtractedMetrics[]): Promise<void> {
      if (rows.length === 0)
        return
      const values = rows.map(m => metricsToRow(scanId, m))
      // Iterate per-row upsert. better-sqlite3's drizzle binding requires sync
      // transaction callbacks (no Promise return), so portability across the
      // async drivers (libsql/D1) precludes a transactional wrapper here. Each
      // upsert is atomic at the row level; partial failure within a batch is
      // acceptable for the single-writer scan workflow.
      for (const v of values) {
        const { scanId: _s, url: _u, ...patch } = v
        await db
          .insert(scanRoutes)
          .values(v)
          .onConflictDoUpdate({
            target: [scanRoutes.scanId, scanRoutes.url],
            set: patch,
          })
      }
    },

    async upsert(scanId: ScanId, row: ExtractedMetrics): Promise<void> {
      const v = metricsToRow(scanId, row)
      const { scanId: _s, url: _u, ...patch } = v
      await db
        .insert(scanRoutes)
        .values(v)
        .onConflictDoUpdate({
          target: [scanRoutes.scanId, scanRoutes.url],
          set: patch,
        })
    },

    async listForScan(scanId: ScanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> {
      const page = Math.max(1, q?.page ?? 1)
      const pageSize = Math.max(1, q?.pageSize ?? DEFAULT_PAGE_SIZE)
      const offset = (page - 1) * pageSize

      const rows = await db
        .select()
        .from(scanRoutes)
        .where(eq(scanRoutes.scanId, scanId))
        .limit(pageSize)
        .offset(offset)

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(scanRoutes)
        .where(eq(scanRoutes.scanId, scanId))

      return {
        items: rows.map(rowToRoute),
        total: count,
        page,
        pageSize,
      }
    },

    async get(scanId: ScanId, url: string): Promise<ScanRoute | null> {
      const [row] = await db
        .select()
        .from(scanRoutes)
        .where(and(eq(scanRoutes.scanId, scanId), eq(scanRoutes.url, url)))
        .limit(1)
      return row ? rowToRoute(row) : null
    },

    async delete(scanId: ScanId, url?: string): Promise<void> {
      const where = url
        ? and(eq(scanRoutes.scanId, scanId), eq(scanRoutes.url, url))
        : eq(scanRoutes.scanId, scanId)
      await db.delete(scanRoutes).where(where)
    },
  }
}
