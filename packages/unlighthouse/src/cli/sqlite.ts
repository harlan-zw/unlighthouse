import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { runSqliteTransaction } from '@unlighthouse/core/storage/drizzle'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

/** Bind Drizzle's portable callback driver to Node's built-in SQLite connection. */
export function createNativeSqliteDriver(db: DatabaseSync) {
  const execute = (sql: string, params: SQLInputValue[], method: Parameters<AsyncRemoteCallback>[2]) => {
    const statement = db.prepare(sql)
    if (method === 'run') {
      statement.run(...params)
      return { rows: [] }
    }
    statement.setReturnArrays(true)
    const rows = method === 'get' ? statement.get(...params) : statement.all(...params)
    // Drizzle expects a flat row or undefined for get, despite its array-only callback type.
    return { rows: rows as unknown as unknown[] }
  }
  const driver = drizzle(
    async (sql, params, method) => execute(sql, params, method),
    async queries => runSqliteTransaction(db, () => queries.map(query => execute(query.sql, query.params, query.method))),
  )
  return Object.assign(driver, { close: () => db.close() })
}
