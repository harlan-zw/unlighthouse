import type { ComparisonDiffRow, ComparisonRow } from '@unlighthouse/contracts/drizzle'
import { comparisonDiffs, comparisons } from '@unlighthouse/contracts/drizzle'
import { and, desc, eq, or } from 'drizzle-orm'

type AnyDrizzle = any

export interface ComparisonListQuery {
  site?: string
  baseScanId?: string
  currentScanId?: string
}

export function createComparisonRepository(db: AnyDrizzle) {
  return {
    async list(q: ComparisonListQuery): Promise<ComparisonRow[]> {
      const conditions = []
      if (q.baseScanId)
        conditions.push(eq(comparisons.baseScanId, q.baseScanId))
      if (q.currentScanId)
        conditions.push(eq(comparisons.currentScanId, q.currentScanId))
      const where = conditions.length === 0
        ? undefined
        : (conditions.length === 1 ? conditions[0] : and(...conditions))

      const builder = db.select().from(comparisons)
      const rows = where
        ? await builder.where(where).orderBy(desc(comparisons.createdAt))
        : await builder.orderBy(desc(comparisons.createdAt))
      return rows as ComparisonRow[]
    },

    async get(id: number): Promise<ComparisonRow | null> {
      const [row] = await db.select().from(comparisons).where(eq(comparisons.id, id)).limit(1)
      return (row as ComparisonRow) ?? null
    },

    async latestForCurrent(scanId: string): Promise<(ComparisonRow & { diffs: ComparisonDiffRow[] }) | null> {
      const [latest] = await db
        .select()
        .from(comparisons)
        .where(eq(comparisons.currentScanId, scanId))
        .orderBy(desc(comparisons.createdAt))
        .limit(1)
      if (!latest)
        return null
      const diffs = await db
        .select()
        .from(comparisonDiffs)
        .where(eq(comparisonDiffs.comparisonId, (latest as ComparisonRow).id))
      return { ...(latest as ComparisonRow), diffs: diffs as ComparisonDiffRow[] }
    },

    async diffs(comparisonId: number): Promise<ComparisonDiffRow[]> {
      const rows = await db.select().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparisonId))
      return rows as ComparisonDiffRow[]
    },

    /** Convenience: list comparisons where scanId is base OR current. */
    async listInvolvingScan(scanId: string): Promise<ComparisonRow[]> {
      const rows = await db
        .select()
        .from(comparisons)
        .where(or(eq(comparisons.baseScanId, scanId), eq(comparisons.currentScanId, scanId)))
        .orderBy(desc(comparisons.createdAt))
      return rows as ComparisonRow[]
    },
  }
}
