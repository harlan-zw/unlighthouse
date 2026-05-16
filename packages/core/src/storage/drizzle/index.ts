import type { Logger, PackRunRepository, ScanRepository, ScanRouteRepository } from '@unlighthouse/contracts'
import { createComparisonRepository } from './repositories/comparisons'
import { createPackRunRepository } from './repositories/pack-runs'
import { createReportRepositories } from './repositories/reports'
import { createScanRouteRepository } from './repositories/routes'
import { createScanRepository } from './repositories/scans'

export interface DrizzleStorage {
  scans: ScanRepository
  routes: ScanRouteRepository
  reports: ReturnType<typeof createReportRepositories>
  comparisons: ReturnType<typeof createComparisonRepository>
  packRuns: PackRunRepository
  /**
   * Raw drizzle handle. Escape hatch for `processScanData` writes; do NOT
   * use from dashboard handlers — go through `reports.*` / `comparisons.*`.
   */
  db: any
}

export interface DrizzleStorageOptions {
  /**
   * Any drizzle instance. Typically:
   *   - `drizzle(new DatabaseSync(path))` for `node:sqlite` (default CLI)
   *   - `drizzle(env.DB)` for Cloudflare D1
   *   - `drizzle(createClient({ url, authToken }))` for libsql/Turso
   *   - `drizzle(new Database(path))` for opt-in `better-sqlite3`
   */
  driver: any
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

/**
 * Build the row-storage half of `Storage`.
 *
 * No module-level state. Each call returns a fresh repository pair bound
 * to the provided drizzle driver. Migrations are NOT run here — ship the
 * SQL via `migrations/sqlite/**` and apply with `drizzle-orm/<driver>/migrator`
 * at boot, OR exec the bundled SQL once on first run.
 */
export function drizzleStorage(opts: DrizzleStorageOptions): DrizzleStorage {
  const { driver } = opts
  return {
    scans: createScanRepository(driver),
    routes: createScanRouteRepository(driver),
    reports: createReportRepositories(driver),
    comparisons: createComparisonRepository(driver),
    packRuns: createPackRunRepository(driver),
    db: driver,
  }
}

export { INIT_SQL, INIT_SQL_STATEMENTS } from './init-sql'
export { applyMigrations } from './migrations'

// Re-export schema/types from contracts for users that want raw access.
export * from '@unlighthouse/contracts/drizzle'
