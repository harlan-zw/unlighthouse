import type { Client, ResultSet } from '@libsql/client'
import type { AsyncRemoteCallback } from 'drizzle-orm/sqlite-proxy'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

/** Keep the remote client injected, so the ORM never imports a native libSQL driver. */
export function createLibsqlDriver(client: Client) {
  const rowsFor = (result: ResultSet, method: Parameters<AsyncRemoteCallback>[2]) => {
    const rows = result.rows.map(row => Array.from(row))
    return { rows: (method === 'run' ? [] : method === 'get' ? rows[0] : rows) as unknown as unknown[] }
  }
  return drizzle(
    async (sql, args, method) => rowsFor(await client.execute({ sql, args }), method),
    async (queries) => {
      const results = await client.batch(queries.map(query => ({ sql: query.sql, args: query.params })), 'write')
      return results.map((result, index) => rowsFor(result, queries[index]!.method))
    },
  )
}
