import type { Logger, ScanRepository, ScanRouteRepository } from '@unlighthouse/contracts'
import { createScanRouteRepository } from './repositories/routes'
import { createScanRepository } from './repositories/scans'

export interface DrizzleStorage {
  scans: ScanRepository
  routes: ScanRouteRepository
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
  }
}

// Re-export schema/types for users that want raw access.
export * from './schema/sqlite'
