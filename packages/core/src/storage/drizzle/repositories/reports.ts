// Report repositories — v2.
// Dashboard aggregation tables have been removed from the schema.
// Cross-route analysis is now handled by packs (pack_runs table).
// Only CrUX (external field data, not derived from LHR) remains.

import type { ScanCruxRow } from '@unlighthouse/contracts/drizzle'
import type { DrizzleDatabase } from '../types'
import { scanCrux } from '@unlighthouse/contracts/drizzle'
import { eq } from 'drizzle-orm'

export function createReportRepositories(db: DrizzleDatabase) {
  return {
    crux: {
      async list(scanId: string): Promise<ScanCruxRow[]> {
        return db.select<ScanCruxRow>().from(scanCrux).where(eq(scanCrux.scanId, scanId))
      },
    },
  }
}
