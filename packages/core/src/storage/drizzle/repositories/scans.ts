import type { ScanRow, ScanRowInsert } from '@unlighthouse/contracts/drizzle'
import type {
  FindPreviousQuery,
  ListQuery,
  ScanInsert,
  ScanRepository,
} from '@unlighthouse/contracts/ports'
import type {
  Paginated,
  Scan,
  ScanId,
} from '@unlighthouse/contracts/types/atoms'
import type { DrizzleDatabase, IdempotentWriteExecutor } from '../types'
import { scans } from '@unlighthouse/contracts/drizzle'
import { and, desc, eq, ne, sql } from 'drizzle-orm'

const DEFAULT_PAGE_SIZE = 50

function rowToScan(row: ScanRow): Scan {
  const { createdAtMs: _ignored, ...rest } = row
  return rest as Scan
}

function insertToRow(scan: ScanInsert): ScanRowInsert {
  return {
    scanId: scan.scanId,
    siteId: scan.siteId ?? null,
    site: scan.site,
    mode: scan.mode ?? 'site',
    device: scan.device,
    status: scan.status,
    startedAt: scan.startedAt,
    completedAt: scan.completedAt ?? null,
    ciBranch: scan.ciBranch ?? null,
    ciCommit: scan.ciCommit ?? null,
    ciCommitMessage: scan.ciCommitMessage ?? null,
    summary: scan.summary ?? null,
  }
}

export function createScanRepository(db: DrizzleDatabase, retryIdempotentWrite?: IdempotentWriteExecutor): ScanRepository {
  const write = retryIdempotentWrite ?? (async <T>(operation: () => Promise<T>) => operation())
  return {
    async create(scan: ScanInsert): Promise<Scan> {
      const [row] = await db.insert<ScanRow>(scans).values(insertToRow(scan)).returning()
      if (!row)
        throw new Error(`Scan insert returned no row: ${scan.scanId}`)
      return rowToScan(row)
    },

    async get(scanId: ScanId): Promise<Scan | null> {
      const [row] = await db.select<ScanRow>().from(scans).where(eq(scans.scanId, scanId)).limit(1)
      return row ? rowToScan(row) : null
    },

    async update(scanId: ScanId, patch: Partial<ScanInsert>): Promise<Scan> {
      const update: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'scanId')
          continue
        update[k] = v === undefined ? null : v
      }
      const [row] = await write(async () => db.update<ScanRow>(scans).set(update).where(eq(scans.scanId, scanId)).returning())
      if (!row)
        throw new Error(`Scan not found: ${scanId}`)
      return rowToScan(row)
    },

    async findPrevious(q: FindPreviousQuery): Promise<Scan | null> {
      const conditions = [
        eq(scans.site, q.site),
        eq(scans.device, q.device),
        eq(scans.status, 'complete'),
      ]
      if (q.branch !== undefined)
        conditions.push(eq(scans.ciBranch, q.branch))
      if (q.excludeScanId !== undefined)
        conditions.push(ne(scans.scanId, q.excludeScanId))

      const [row] = await db
        .select<ScanRow>()
        .from(scans)
        .where(and(...conditions))
        .orderBy(desc(scans.startedAt), desc(scans.createdAtMs))
        .limit(1)

      return row ? rowToScan(row) : null
    },

    async list(q: ListQuery): Promise<Paginated<Scan>> {
      const page = Math.max(1, q.page ?? 1)
      const pageSize = Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE)
      const offset = (page - 1) * pageSize

      const conditions = []
      if (q.site)
        conditions.push(eq(scans.site, q.site))
      if (q.device)
        conditions.push(eq(scans.device, q.device))
      if (q.branch)
        conditions.push(eq(scans.ciBranch, q.branch))
      if (q.status)
        conditions.push(eq(scans.status, q.status))

      const where = conditions.length ? and(...conditions) : undefined

      const rows = await db
        .select<ScanRow>()
        .from(scans)
        .where(where)
        .orderBy(desc(scans.startedAt), desc(scans.createdAtMs))
        .limit(pageSize)
        .offset(offset)

      const [countRow] = await db
        .select<{ count: number }>({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(scans)
        .where(where)

      return {
        items: rows.map(rowToScan),
        total: countRow?.count ?? 0,
        page,
        pageSize,
      }
    },

    async delete(scanId: ScanId): Promise<void> {
      await write(async () => { await db.delete(scans).where(eq(scans.scanId, scanId)) })
    },
  }
}
