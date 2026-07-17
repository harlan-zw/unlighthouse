import type { ScanRouteRow } from '@unlighthouse/contracts/drizzle'
import type { RouteListQuery, ScanRouteRepository, ScanRouteWrite } from '@unlighthouse/contracts/ports'
import type {
  Device,
  Paginated,
  ScanId,
  ScanRoute,
} from '@unlighthouse/contracts/types/atoms'
import type { DrizzleBatchExecutor, DrizzleDatabase, IdempotentWriteExecutor } from '../types'
import { scanRoutes } from '@unlighthouse/contracts/drizzle'
import { ScanRouteSchema } from '@unlighthouse/contracts/types/atoms'
import { and, asc, desc, eq, gte, isNotNull, like, sql } from 'drizzle-orm'
import { routeArtifactKeys } from '../../artifact-keys'

const DEFAULT_PAGE_SIZE = 100

function metricsToRow(scanId: string, device: Device, m: ScanRouteWrite) {
  const keys = routeArtifactKeys(scanId, m.url, device)
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
    scoreAgenticBrowsing: m.scoreAgenticBrowsing,
    lcp: m.lcp,
    cls: m.cls,
    inp: m.inp,
    fcp: m.fcp,
    ttfb: m.ttfb,
    tbt: m.tbt,
    si: m.si,
    lighthouseVersion: m.lighthouseVersion,
    auditor: m.auditor ?? null,
    capturedAt: m.capturedAt,
    lhrBlobKey: m.lhrBlobKey ?? keys.lhr,
    reportBlobKey: m.reportBlobKey === undefined ? keys.report : m.reportBlobKey,
    screenshotBlobKey: m.screenshotBlobKey ?? null,
  }
}

function rowToRoute(row: ScanRouteRow): ScanRoute {
  return ScanRouteSchema.parse(row)
}

function createUpsertStatement(db: DrizzleDatabase, value: ReturnType<typeof metricsToRow>) {
  const { scanId: _s, url: _u, device: _d, ...patch } = value
  return db
    .insert(scanRoutes)
    .values(value)
    .onConflictDoUpdate({
      target: [scanRoutes.scanId, scanRoutes.url, scanRoutes.device],
      set: patch,
    })
}

export function createScanRouteRepository(
  db: DrizzleDatabase,
  executeBatch?: DrizzleBatchExecutor,
  retryIdempotentWrite?: IdempotentWriteExecutor,
): ScanRouteRepository {
  const write = retryIdempotentWrite ?? (async <T>(operation: () => Promise<T>) => operation())
  return {
    async putBatch(scanId: ScanId, device: Device, rows: ScanRouteWrite[]): Promise<void> {
      if (rows.length === 0)
        return
      const values = rows.map(m => metricsToRow(scanId, device, m))
      if (executeBatch) {
        const [first, ...rest] = values.map(value => createUpsertStatement(db, value))
        if (first)
          await write(() => executeBatch([first, ...rest]))
        return
      }
      // Iterate per-row upsert. better-sqlite3's drizzle binding requires sync
      // transaction callbacks (no Promise return), so portability across the
      // async drivers (libsql/D1) precludes a transactional wrapper here. Each
      // upsert is atomic at the row level; partial failure within a batch is
      // acceptable for the single-writer scan workflow.
      for (const v of values) {
        await write(async () => { await createUpsertStatement(db, v) })
      }
    },

    async upsert(scanId: ScanId, device: Device, row: ScanRouteWrite): Promise<void> {
      const v = metricsToRow(scanId, device, row)
      await write(async () => { await createUpsertStatement(db, v) })
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
        case 'score-asc': orderBy = asc(scanRoutes.scorePerformance)
          break
        case 'score-desc': orderBy = desc(scanRoutes.scorePerformance)
          break
        case 'lcp-asc': orderBy = asc(scanRoutes.lcp)
          break
        case 'lcp-desc': orderBy = desc(scanRoutes.lcp)
          break
        case 'url-asc': orderBy = asc(scanRoutes.url)
          break
        case 'capturedAt-desc': orderBy = desc(scanRoutes.capturedAt)
          break
        default: orderBy = undefined
      }

      const baseSelect = db.select<ScanRouteRow>().from(scanRoutes).where(where)
      const rows = await (orderBy ? baseSelect.orderBy(orderBy) : baseSelect)
        .limit(pageSize)
        .offset(offset)

      const [countRow] = await db
        .select<{ count: number }>({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(scanRoutes)
        .where(where)

      return {
        items: rows.map(rowToRoute),
        total: countRow?.count ?? 0,
        page,
        pageSize,
      }
    },

    async findByPath(scanId: ScanId, path: string): Promise<ScanRoute[]> {
      const rows = await db
        .select<ScanRouteRow>()
        .from(scanRoutes)
        .where(and(eq(scanRoutes.scanId, scanId), eq(scanRoutes.path, path)))
        .orderBy(asc(scanRoutes.device))
      return rows.map(rowToRoute)
    },

    async get(scanId: ScanId, url: string, device: Device): Promise<ScanRoute | null> {
      const [row] = await db
        .select<ScanRouteRow>()
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
      await write(async () => { await db.delete(scanRoutes).where(where) })
    },
  }
}
