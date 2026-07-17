import type { Logger, PackRunRepository, ScanRepository, ScanRouteRepository, SiteRepository } from '@unlighthouse/contracts'
import type { DrizzleBatchExecutor, DrizzleDatabase, IdempotentWriteExecutor } from './types'
import { createComparisonRepository } from './repositories/comparisons'
import { createPackRunRepository } from './repositories/pack-runs'
import { createReportRepositories } from './repositories/reports'
import { createScanRouteRepository } from './repositories/routes'
import { createScanRepository } from './repositories/scans'
import { createSiteRepository } from './repositories/sites'
import { asDrizzleDatabase } from './types'

export interface DrizzleStorage {
  sites: SiteRepository
  scans: ScanRepository
  routes: ScanRouteRepository
  reports: ReturnType<typeof createReportRepositories>
  comparisons: ReturnType<typeof createComparisonRepository>
  packRuns: PackRunRepository
  /** Raw drizzle handle for advanced queries outside the repository surface. */
  db: DrizzleDatabase
}

export interface DrizzleStorageOptions {
  /**
   * Any drizzle instance. Typically:
   *   - `drizzle(new DatabaseSync(path))` for `node:sqlite`
   *   - `drizzle(env.DB)` for Cloudflare D1
   *   - `drizzle(createClient({ url, authToken }))` for libsql/Turso
   *   - `drizzle(new Database(path))` for the v1 local CLI `better-sqlite3` default
   */
  driver: unknown
  /** Runtime adapter for atomic statement batches (for example D1 `db.batch`). */
  executeBatch?: DrizzleBatchExecutor
  /**
   * Runtime-specific transient retry policy. Core invokes it only for
   * deterministic upserts, updates, and deletes; inserts with generated
   * identity deliberately bypass it.
   */
  retryIdempotentWrite?: IdempotentWriteExecutor
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
  const driver = asDrizzleDatabase(opts.driver)
  return {
    sites: createSiteRepository(driver, opts.retryIdempotentWrite),
    scans: createScanRepository(driver, opts.retryIdempotentWrite),
    routes: createScanRouteRepository(driver, opts.executeBatch, opts.retryIdempotentWrite),
    reports: createReportRepositories(driver),
    comparisons: createComparisonRepository(driver),
    packRuns: createPackRunRepository(driver, opts.retryIdempotentWrite),
    db: driver,
  }
}

export { INIT_SQL, INIT_SQL_STATEMENTS } from './init-sql'
export { applyMigrations, ensureSchema } from './migrations'
// Repository factories, exported so any host with a drizzle-compatible driver
// (D1, libsql, better-sqlite3) reuses the exact same query code — see the
// Cloudflare d1-r2 storage, which builds a `drizzle-orm/d1` handle and calls
// these directly rather than re-implementing the SQL.
export { createComparisonRepository } from './repositories/comparisons'
export { createReportRepositories } from './repositories/reports'
export { asDrizzleDatabase } from './types'
export type { DrizzleBatchExecutor, DrizzleDatabase, IdempotentWriteExecutor } from './types'

// Re-export schema/types from contracts for users that want raw access.
export * from '@unlighthouse/contracts/drizzle'
