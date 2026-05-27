import type { Logger } from '@unlighthouse/contracts'
import { join } from 'node:path'
import { createStorage } from '@unlighthouse/core/storage'
import { applyMigrations, drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { drizzle as drizzleBetterSqlite } from 'drizzle-orm/better-sqlite3'
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
   * Supported schemes:
   *   - `file:/abs/path/to.sqlite`  — better-sqlite3 (default for CLI)
   *   - `libsql://host[?authToken=...]` — remote libSQL / Turso
   *   - `libsql+http://host` / `libsql+https://host` — explicit HTTP transport
   *   - bare absolute or relative path — same as `file:` (convenience)
   *
   * Additional schemes (postgres://, mysql://) throw a clear "not yet
   * supported" error.
   */
  dbUrl?: string
  logger?: Logger | { warn?: (...args: any[]) => void, info?: (...args: any[]) => void, debug?: (...args: any[]) => void }
}

type ParsedDbUrl
  = | { scheme: 'file', path: string }
    | { scheme: 'libsql', url: string, authToken?: string }

// Tiny parser instead of `new URL()` because file:/abs/path doesn't
// round-trip cleanly through URL (it normalises double slashes, host vs
// path edge cases differ across runtimes). For just the schemes we
// support today, a manual prefix check is clearer.
function parseDbUrl(raw: string): ParsedDbUrl {
  if (raw.startsWith('file:'))
    return { scheme: 'file', path: raw.slice('file:'.length) }

  if (raw.startsWith('libsql:') || raw.startsWith('libsql+http:') || raw.startsWith('libsql+https:')) {
    // Auth token can travel as ?authToken=... in the URL OR via the
    // dedicated env var. URL parser handles either query-string layout.
    // Fall back: bare libsql:// without a query string is fine for
    // local-file libsql or unauthenticated dev instances.
    let authToken: string | undefined
    try {
      const u = new URL(raw)
      authToken = u.searchParams.get('authToken') ?? undefined
    }
    catch {
      // Malformed URL — let the libsql client surface the real error
      // when it tries to connect.
    }
    return {
      scheme: 'libsql',
      url: raw,
      authToken: authToken ?? process.env.UNLIGHTHOUSE_DB_AUTH_TOKEN,
    }
  }

  if (raw.startsWith('postgres:') || raw.startsWith('postgresql:') || raw.startsWith('mysql:')) {
    throw new Error(
      `UNLIGHTHOUSE_DB_URL scheme not yet supported in this build: ${raw.split(':')[0]}:. `
      + `Only file: and libsql: URLs work today.`,
    )
  }

  // Bare path → treat as file URL. Lets users set UNLIGHTHOUSE_DB_URL=/var/lib/u/db.sqlite
  // without ceremony.
  if (raw.startsWith('/') || raw.startsWith('./') || /^[a-z]:[\\/]/i.test(raw))
    return { scheme: 'file', path: raw }

  throw new Error(`UNLIGHTHOUSE_DB_URL is not a recognised URL or path: ${raw}`)
}

// libsql-backed storage. Returns the same shape as the better-sqlite3
// path so callers don't branch on driver. Two notable differences:
//
//   1. The runtime migrations module (applyMigrations) needs the
//      better-sqlite3 sync API for schema introspection (PRAGMA
//      table_info, prepared statements). We skip it for libsql and log
//      a warning — operators wiring Turso start with a fresh DB, so
//      INIT_SQL_STATEMENTS is enough. Schema bumps post-deploy need a
//      separate migration plan.
//
//   2. The returned `sqliteDb` is the libsql Client (not a better-
//      sqlite3 instance). Callers that poke `sqliteDb` directly will
//      need to branch; today nothing does.
async function initLibsqlStorage(
  parsed: Extract<ParsedDbUrl, { scheme: 'libsql' }>,
  outputPath: string,
  logger: InitStorageOptions['logger'],
) {
  // Dynamic imports so users on the file: path don't pay the load cost
  // for libsql, and so a missing peer dep surfaces with a useful error
  // rather than a top-level Cannot find module.
  const { createClient } = await import('@libsql/client')
  const { drizzle: drizzleLibsql } = await import('drizzle-orm/libsql')

  logger?.debug?.(`Connecting to libsql: ${parsed.url}`)
  const client = createClient({
    url: parsed.url,
    authToken: parsed.authToken,
  })

  // Execute each INIT statement sequentially. `executeMultiple` would be
  // faster but most of these are CREATE IF NOT EXISTS, so failures from
  // duplicates need per-statement handling.
  for (const stmt of INIT_SQL_STATEMENTS) {
    try {
      await client.execute(stmt)
    }
    catch (err) {
      const msg = (err as Error).message
      if (!/already exists|duplicate column name/i.test(msg))
        logger?.warn?.(`Migration stmt skipped: ${msg}`)
    }
  }

  logger?.info?.(`[storage] libsql: schema applied. Runtime migrations skipped — schema bumps require manual upgrade.`)

  const drizzleDb = drizzleLibsql(client)
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

  // `sqliteDb` is the libsql Client for libsql-backed setups. Shape is
  // not interface-compatible with better-sqlite3 — flagged in the
  // returned tuple type so consumers know what they're getting.
  return { sqliteDb: client, drizzleDb, drizzleAdapter, storage }
}

export async function initStorage({ outputPath, dbUrl, logger }: InitStorageOptions) {
  const url = dbUrl ?? process.env.UNLIGHTHOUSE_DB_URL ?? `file:${join(outputPath, 'db.sqlite')}`
  const parsed = parseDbUrl(url)

  if (parsed.scheme === 'libsql')
    return initLibsqlStorage(parsed, outputPath, logger)

  // file: scheme (default) — better-sqlite3, sync API, runtime migrations.
  logger?.debug?.(`Opening SQLite (file): ${parsed.path}`)
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

  const drizzleDb = drizzleBetterSqlite(sqliteDb)
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
