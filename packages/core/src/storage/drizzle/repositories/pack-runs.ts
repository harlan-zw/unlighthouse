import type {
  PackRun,
  PackRunRepository,
  ScanId,
} from '@unlighthouse/contracts'
import type { PackRunRow } from '@unlighthouse/contracts/drizzle'
import { packRuns } from '@unlighthouse/contracts/drizzle'
import { and, eq } from 'drizzle-orm'

type AnyDrizzle = any

function rowToPackRun(row: PackRunRow): PackRun {
  return {
    scanId: row.scanId as ScanId,
    packName: row.packName,
    packVersion: row.packVersion,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    report: row.report ?? null,
    reportBlobKey: row.reportBlobKey ?? null,
  }
}

export function createPackRunRepository(db: AnyDrizzle): PackRunRepository {
  return {
    async get(scanId, packName, packVersion) {
      const [row] = await db
        .select()
        .from(packRuns)
        .where(and(
          eq(packRuns.scanId, scanId),
          eq(packRuns.packName, packName),
          eq(packRuns.packVersion, packVersion),
        ))
        .limit(1)
      return row ? rowToPackRun(row) : null
    },

    // Plain upsert keyed on the composite PK. Pack reports for an immutable
    // scan don't change, so overwriting on conflict is a no-op in practice;
    // we include it so re-running after a `delete` (or a crash mid-write)
    // is idempotent.
    async put(run) {
      await db
        .insert(packRuns)
        .values({
          scanId: run.scanId,
          packName: run.packName,
          packVersion: run.packVersion,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          report: run.report ?? null,
          reportBlobKey: run.reportBlobKey ?? null,
        })
        .onConflictDoUpdate({
          target: [packRuns.scanId, packRuns.packName, packRuns.packVersion],
          set: {
            startedAt: run.startedAt,
            completedAt: run.completedAt,
            report: run.report ?? null,
            reportBlobKey: run.reportBlobKey ?? null,
          },
        })
    },

    async listForScan(scanId) {
      const rows = await db
        .select()
        .from(packRuns)
        .where(eq(packRuns.scanId, scanId))
      return rows.map(rowToPackRun)
    },

    async delete(scanId: ScanId, packName?: string) {
      const cond = packName
        ? and(eq(packRuns.scanId, scanId), eq(packRuns.packName, packName))
        : eq(packRuns.scanId, scanId)
      await db.delete(packRuns).where(cond)
    },
  }
}
