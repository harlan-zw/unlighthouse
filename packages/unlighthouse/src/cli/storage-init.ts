import type { Logger } from '@unlighthouse/contracts'
import { join } from 'node:path'
import { createStorage } from '@unlighthouse/core/storage'
import { applyMigrations, drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fsDriver from 'unstorage/drivers/fs'

export interface InitStorageOptions {
  outputPath: string
  logger?: Logger | { warn?: (...args: any[]) => void, info?: (...args: any[]) => void, debug?: (...args: any[]) => void }
}

export function initStorage({ outputPath, logger }: InitStorageOptions) {
  logger?.debug?.(`Opening SQLite: ${join(outputPath, 'db.sqlite')}`)
  const sqliteDb = new Database(join(outputPath, 'db.sqlite'))

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
