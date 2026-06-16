// Report repositories — v2.
// Dashboard aggregation tables have been removed from the schema.
// Cross-route analysis is now handled by packs (pack_runs table).
// Only CrUX (external field data, not derived from LHR) remains.

import type { ScanCruxRow } from '@unlighthouse/contracts/drizzle'
import { scanCrux } from '@unlighthouse/contracts/drizzle'
import { eq } from 'drizzle-orm'

type AnyDrizzle = any

export function createReportRepositories(db: AnyDrizzle) {
  return {
    crux: {
      async list(scanId: string): Promise<ScanCruxRow[]> {
        const rows = await db.select().from(scanCrux).where(eq(scanCrux.scanId, scanId))
        return rows as ScanCruxRow[]
      },
    },
  }
}
