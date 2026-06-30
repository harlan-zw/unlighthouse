import type { ComparisonDiffRow, ComparisonRow } from '@unlighthouse/contracts/drizzle'
import type { DrizzleDatabase } from '../types'
import { comparisonDiffs, comparisons } from '@unlighthouse/contracts/drizzle'
import { and, desc, eq, or } from 'drizzle-orm'

export interface ComparisonListQuery {
  site?: string
  baseScanId?: string
  currentScanId?: string
}

export function createComparisonRepository(db: DrizzleDatabase) {
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

      const builder = db.select<ComparisonRow>().from(comparisons)
      const rows = where
        ? await builder.where(where).orderBy(desc(comparisons.createdAt))
        : await builder.orderBy(desc(comparisons.createdAt))
      return rows as ComparisonRow[]
    },

    async get(id: number): Promise<ComparisonRow | null> {
      const [row] = await db.select<ComparisonRow>().from(comparisons).where(eq(comparisons.id, id)).limit(1)
      return row ?? null
    },

    async latestForCurrent(scanId: string): Promise<(ComparisonRow & { diffs: ComparisonDiffRow[] }) | null> {
      const [latest] = await db
        .select<ComparisonRow>()
        .from(comparisons)
        .where(eq(comparisons.currentScanId, scanId))
        .orderBy(desc(comparisons.createdAt))
        .limit(1)
      if (!latest)
        return null
      const diffs = await db
        .select<ComparisonDiffRow>()
        .from(comparisonDiffs)
        .where(eq(comparisonDiffs.comparisonId, latest.id))
      return { ...latest, diffs }
    },

    async diffs(comparisonId: number): Promise<ComparisonDiffRow[]> {
      return db.select<ComparisonDiffRow>().from(comparisonDiffs).where(eq(comparisonDiffs.comparisonId, comparisonId))
    },

    /** Convenience: list comparisons where scanId is base OR current. */
    async listInvolvingScan(scanId: string): Promise<ComparisonRow[]> {
      const rows = await db
        .select<ComparisonRow>()
        .from(comparisons)
        .where(or(eq(comparisons.baseScanId, scanId), eq(comparisons.currentScanId, scanId)))
        .orderBy(desc(comparisons.createdAt))
      return rows
    },
  }
}
