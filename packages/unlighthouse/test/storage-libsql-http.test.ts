import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { initStorage } from '../src/cli/storage-init'

vi.mock('../src/runtime-download', () => ({ downloadDependencies: async () => (specifier: string) => specifier }))

it('uses the web client for libsql+http URLs and URL auth tokens', async () => {
  const db = new DatabaseSync(':memory:')
  const authorization: string[] = []
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(404).end()
      return
    }
    authorization.push(req.headers.authorization ?? '')
    let input = ''
    for await (const chunk of req)
      input += chunk.toString()
    const pipeline = JSON.parse(input)
    const results = pipeline.requests.map((request: { type: string, stmt?: { sql: string, args: Array<{ type: string, value?: string | number }> } }) => {
      if (request.type === 'close')
        return { type: 'ok', response: { type: 'close' } }
      try {
        const stmt = request.stmt!
        const statement = db.prepare(stmt.sql)
        const args = stmt.args.map(arg => arg.type === 'null' ? null : arg.type === 'integer' ? BigInt(arg.value!) : arg.type === 'float' ? Number(arg.value) : String(arg.value))
        statement.setReturnArrays(true)
        const columns = statement.columns()
        const encode = (value: unknown) => value === null ? { type: 'null' } : typeof value === 'number' || typeof value === 'bigint' ? { type: 'integer', value: String(value) } : { type: 'text', value: String(value) }
        const rows = columns.length ? statement.all(...args).map(row => (row as unknown[]).map(encode)) : []
        const run = columns.length ? { changes: 0, lastInsertRowid: 0 } : statement.run(...args)
        return { type: 'ok', response: { type: 'execute', result: { cols: columns.map(column => ({ name: column.name, decltype: column.type })), rows, affected_row_count: Number(run.changes), last_insert_rowid: String(run.lastInsertRowid) } } }
      }
      catch (error) {
        return { type: 'error', error: { message: (error as Error).message, code: 'SQLITE_ERROR' } }
      }
    })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ baton: null, base_url: null, results }))
  })
  const outputPath = await mkdtemp(join(tmpdir(), 'unlighthouse-libsql-http-'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No fixture address')
  try {
    const storage = await initStorage({ outputPath, dbUrl: `libsql+http://127.0.0.1:${address.port}?authToken=fixture-token`, env: { UNLIGHTHOUSE_BLOBS_DRIVER: 'memory' } })
    await storage.storage.sites.create({ id: 'remote', name: 'Remote', url: 'https://example.com', group: null, createdAt: new Date().toISOString() })
    expect(await storage.storage.sites.get('remote')).toMatchObject({ name: 'Remote' })
    expect(authorization.every(value => value === 'Bearer fixture-token')).toBe(true)
    storage.sqliteDb.close()
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    await rm(outputPath, { recursive: true, force: true })
  }
}, 15000)
