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
import { and, asc, desc, eq, gte, isNotNull, like, lte, sql } from 'drizzle-orm'

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

      // Build the WHERE clause from every filter the query carries. Each
      // condition is pushed down to SQL — the API handler used to do this
      // in JS on the full row set which fell over on 10k+ route scans.
      // Column-typed conditions like `gte(scanRoutes.scorePerformance, …)`
      // are nullable-safe: drizzle emits `column >= ?` which SQL evaluates
      // to NULL (not true, not false) for null columns, so missing values
      // never match the filter — same semantics as the JS fallback.
      const conditions = [eq(scanRoutes.scanId, scanId)]
      if (q?.device)
        conditions.push(eq(scanRoutes.device, q.device))
      if (q?.filter?.minScore) {
        const map = {
          'performance': scanRoutes.scorePerformance,
          'accessibility': scanRoutes.scoreAccessibility,
          'seo': scanRoutes.scoreSeo,
          'best-practices': scanRoutes.scoreBestPractices,
        } as const
        for (const [cat, min] of Object.entries(q.filter.minScore)) {
          const col = map[cat as keyof typeof map]
          if (col != null && typeof min === 'number')
            conditions.push(isNotNull(col), gte(col, min))
        }
      }
      if (q?.filter?.maxMetric) {
        const map = {
          lcp: scanRoutes.lcp,
          cls: scanRoutes.cls,
          inp: scanRoutes.inp,
          fcp: scanRoutes.fcp,
          ttfb: scanRoutes.ttfb,
          tbt: scanRoutes.tbt,
          si: scanRoutes.si,
        } as const
        for (const [metric, max] of Object.entries(q.filter.maxMetric)) {
          const col = map[metric as keyof typeof map]
          // Note: this branch keeps the JS-fallback semantics (null columns
          // match) by NOT chaining `isNotNull` — `column <= ?` with a null
          // value yields NULL, which drizzle's `where` treats as "exclude",
          // contradicting the JS path. We patch it with `OR column IS NULL`.
          if (col != null && typeof max === 'number')
            conditions.push(sql`(${col} IS NULL OR ${col} <= ${max})`)
        }
      }
      if (q?.filter?.urlPattern) {
        // Literal-substring fast path. The wire field on `scan.results`
        // is documented as a regex source — application-side fallback in
        // the API handler still re-runs the full RegExp on the result
        // page for callers that pass a real regex.
        conditions.push(like(scanRoutes.url, `%${q.filter.urlPattern}%`))
      }
      const where = conditions.length > 1 ? and(...conditions) : conditions[0]

      // ORDER BY push-down. The fallback in api/handlers/scan.ts uses the
      // same column choices so behaviour matches.
      let orderBy
      switch (q?.sort) {
        case 'score-asc': orderBy = asc(scanRoutes.scorePerformance); break
        case 'score-desc': orderBy = desc(scanRoutes.scorePerformance); break
        case 'lcp-asc': orderBy = asc(scanRoutes.lcp); break
        case 'lcp-desc': orderBy = desc(scanRoutes.lcp); break
        case 'url-asc': orderBy = asc(scanRoutes.url); break
        case 'capturedAt-desc': orderBy = desc(scanRoutes.capturedAt); break
        default: orderBy = undefined
      }

      const baseSelect = db.select().from(scanRoutes).where(where)
      const rows = await (orderBy ? baseSelect.orderBy(orderBy) : baseSelect)
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
