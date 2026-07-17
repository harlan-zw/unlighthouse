// A faithful-enough D1Database + R2Bucket pair backed by better-sqlite3 and an
// in-memory Map, so the REAL `d1R2Storage` (raw-SQL scan/route/pack repos AND
// the shared drizzle-orm/d1 reports/comparisons repos) runs end-to-end in a
// plain Node test. D1 is sqlite, so better-sqlite3 executes the identical SQL
// the drizzle sqlite dialect emits.
//
// This is the pragmatic stand-in the D-035 handoff sanctions when a
// miniflare/workerd harness isn't wired: it exercises the same code path a real
// Worker would, minus the workerd runtime. A real miniflare test is the
// follow-up (see the package README runbook).

import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  R2Bucket,
} from '@cloudflare/workers-types'
import Database from 'better-sqlite3'

type BetterDb = Database.Database
type BetterStmt = Database.Statement

function toResult<T>(results: T[], changes = 0, lastRowId = 0): D1Result<T> {
  return {
    results,
    success: true,
    meta: {
      changes,
      last_row_id: lastRowId,
      duration: 0,
      size_after: 0,
      rows_read: results.length,
      rows_written: changes,
      served_by: 'better-sqlite3',
      changed_db: changes > 0,
    },
  } as unknown as D1Result<T>
}

// Synchronous executor shared by the async D1 methods and the atomic batch()
// path (better-sqlite3 transactions must be synchronous).
function execAll(stmt: BetterStmt, params: unknown[]): { rows: unknown[], changes: number, lastRowId: number } {
  if (stmt.reader) {
    stmt.raw(false)
    const rows = stmt.all(...(params as never[]))
    return { rows, changes: 0, lastRowId: 0 }
  }
  const info = stmt.run(...(params as never[]))
  return { rows: [], changes: info.changes, lastRowId: Number(info.lastInsertRowid) }
}

function makeStatement(db: BetterDb, sql: string, params: unknown[]): D1PreparedStatement {
  // Prepare lazily: D1's `prepare` is lazy, but better-sqlite3 compiles (and
  // schema-validates) at prepare time. Deferring until execution lets
  // `migrate`'s batch of CREATE TABLE + CREATE INDEX DDL run in order.
  const prep = (): BetterStmt => db.prepare(sql)
  const api = {
    bind(...values: unknown[]): D1PreparedStatement {
      return makeStatement(db, sql, values)
    },
    async first<T>(colName?: string): Promise<T | null> {
      const stmt = prep()
      if (!stmt.reader) {
        stmt.run(...(params as never[]))
        return null
      }
      stmt.raw(false)
      const row = stmt.get(...(params as never[])) as Record<string, unknown> | undefined
      if (row == null)
        return null
      return (colName ? (row[colName] as T) : (row as T))
    },
    async run<T>(): Promise<D1Result<T>> {
      const { rows, changes, lastRowId } = execAll(prep(), params)
      return toResult(rows as T[], changes, lastRowId)
    },
    async all<T>(): Promise<D1Result<T>> {
      const { rows, changes, lastRowId } = execAll(prep(), params)
      return toResult(rows as T[], changes, lastRowId)
    },
    async raw<T>(): Promise<T[]> {
      const stmt = prep()
      if (!stmt.reader)
        return []
      stmt.raw(true)
      const rows = stmt.all(...(params as never[])) as T[]
      stmt.raw(false)
      return rows
    },
    // Internal sync exec for batch().
    __execSync(): D1Result<unknown> {
      const { rows, changes, lastRowId } = execAll(prep(), params)
      return toResult(rows, changes, lastRowId)
    },
  }
  return api as unknown as D1PreparedStatement
}

export interface D1TestHandles {
  db: D1Database
  raw: BetterDb
}

/** Build an in-memory better-sqlite3 handle wearing the D1Database interface. */
export function createTestD1(): D1TestHandles {
  const raw = new Database(':memory:')
  raw.pragma('foreign_keys = ON')
  const db = {
    prepare(sql: string): D1PreparedStatement {
      return makeStatement(raw, sql, [])
    },
    async batch<T>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      const run = raw.transaction((list: Array<{ __execSync: () => D1Result<unknown> }>) =>
        list.map(s => s.__execSync()),
      )
      return run(stmts as unknown as Array<{ __execSync: () => D1Result<unknown> }>) as D1Result<T>[]
    },
    async exec(sql: string) {
      raw.exec(sql)
      return { count: 0, duration: 0 }
    },
  }
  return { db: db as unknown as D1Database, raw }
}

/** Minimal in-memory R2 bucket covering the surface r2BlobStore touches. */
export function createTestR2(): R2Bucket {
  const store = new Map<string, Uint8Array>()
  const bucket = {
    async put(key: string, data: Uint8Array) {
      store.set(key, data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer))
      return { key } as unknown
    },
    async get(key: string) {
      const data = store.get(key)
      if (!data)
        return null
      return {
        key,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(data)
            controller.close()
          },
        }),
        async arrayBuffer() {
          return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        },
      } as unknown
    },
    async head(key: string) {
      return store.has(key) ? ({ key } as unknown) : null
    },
    async delete(key: string) {
      store.delete(key)
    },
    async list(options?: { prefix?: string }) {
      const objects = [...store.keys()]
        .filter(key => key.startsWith(options?.prefix ?? ''))
        .map(key => ({ key }))
      return { objects, truncated: false }
    },
  }
  return bucket as unknown as R2Bucket
}
