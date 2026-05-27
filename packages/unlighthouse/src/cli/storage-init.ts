import type { Logger } from '@unlighthouse/contracts'
import { join } from 'node:path'
import { createStorage } from '@unlighthouse/core/storage'
import { applyMigrations, drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fsDriver from 'unstorage/drivers/fs'

export interface InitStorageOptions {
  /**
   * Default base directory used when no DB URL is configured and as the
   * blob root. Persisted scans live under `<outputPath>/db.sqlite` +
   * `<outputPath>/blobs/...` for the local CLI.
   */
  outputPath: string
  /**
   * Override for the storage URL. When omitted, reads `UNLIGHTHOUSE_DB_URL`
   * from env, then falls back to `file:<outputPath>/db.sqlite`.
   *
   * Supported schemes today:
   *   - `file:/abs/path/to.sqlite`  — better-sqlite3 (default for CLI)
   *   - bare absolute or relative path — same as `file:` (convenience)
   *
   * Additional schemes (libsql://, etc.) are wired in subsequent commits
   * via the same parser; for now they throw a clear error.
   */
  dbUrl?: string
  logger?: Logger | { warn?: (...args: any[]) => void, info?: (...args: any[]) => void, debug?: (...args: any[]) => void }
}

interface ParsedDbUrl {
  scheme: 'file'
  path: string
}

// Tiny parser instead of `new URL()` because file:/abs/path doesn't
// round-trip cleanly through URL (it normalises double slashes, host vs
// path edge cases differ across runtimes). For just the schemes we
// support today, a manual prefix check is clearer.
function parseDbUrl(raw: string): ParsedDbUrl {
  if (raw.startsWith('file:')) {
    return { scheme: 'file', path: raw.slice('file:'.length) }
  }
  if (raw.startsWith('libsql:') || raw.startsWith('postgres:') || raw.startsWith('postgresql:') || raw.startsWith('mysql:')) {
    throw new Error(
      `UNLIGHTHOUSE_DB_URL scheme not yet supported in this build: ${raw.split(':')[0]}:. `
      + `Only file: URLs work today; libsql/postgres support lands in subsequent commits.`,
    )
  }
  // Bare path → treat as file URL. Lets users set UNLIGHTHOUSE_DB_URL=/var/lib/u/db.sqlite
  // without ceremony.
  if (raw.startsWith('/') || raw.startsWith('./') || /^[a-z]:[\\/]/i.test(raw))
    return { scheme: 'file', path: raw }

  throw new Error(`UNLIGHTHOUSE_DB_URL is not a recognised URL or path: ${raw}`)
}

export function initStorage({ outputPath, dbUrl, logger }: InitStorageOptions) {
  const url = dbUrl ?? process.env.UNLIGHTHOUSE_DB_URL ?? `file:${join(outputPath, 'db.sqlite')}`
  const parsed = parseDbUrl(url)

  // Future: dispatch on parsed.scheme. Only one driver today.
  logger?.debug?.(`Opening SQLite (${parsed.scheme}): ${parsed.path}`)
  const sqliteDb = new Database(parsed.path)

  for (const stmt of INIT_SQL_STATEMENTS) {
    try {
      sqliteDb.exec(stmt)
    }
    catch (err) {
      const msg = (err as Error).message
      if (!/duplicate column name/i.test(msg))
        logger?.warn?.(`Migration stmt skipped: ${msg}`)
    }
  }

  applyMigrations(sqliteDb, {
    onApply: id => logger?.info?.(`[storage] applied migration: ${id}`),
  })

  const drizzleDb = drizzle(sqliteDb)
  const drizzleAdapter = drizzleStorage({
    driver: drizzleDb,
    logger: (logger as any)?.withTag?.('storage/drizzle') ?? logger,
  })

  const storage = createStorage({
    rows: { ...drizzleAdapter, db: drizzleAdapter.db },
    blobs: unstorageBlobs({
      driver: fsDriver({ base: join(outputPath, 'blobs') }),
    }),
  })

  return { sqliteDb, drizzleDb, drizzleAdapter, storage }
}
