import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import type { EventBus } from '../events.ts'

export const DB_KEY = 'unlighthouse.db.gz'
export const STATE_KEY = 'state.json'
const BLOB_PREFIX = 'blobs/'

export interface RemoteSyncOptions {
  dataDir: string
  url: string
  token?: string
  log?: (line: string) => void
  debounceMs?: number
  concurrency?: number
}

export interface RemoteState {
  syncedAt: number
  nextRunAt: number | null
}

export interface RemoteSync {
  blobsRestored: Promise<void>
  watch(bus: EventBus): () => void
  flush(): Promise<void>
  close(): Promise<void>
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function signature(path: string): string {
  const stats = statSync(path)
  return `${stats.size}:${stats.mtimeMs}`
}

function walk(root: string): string[] {
  if (!existsSync(root))
    return []
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile() && !entry.name.endsWith('.tmp'))
      files.push(join(entry.parentPath, entry.name))
  }
  return files
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length)
      await work(items[next++]!)
  })
  await Promise.all(lanes)
}

export async function openRemoteSync(options: RemoteSyncOptions): Promise<RemoteSync> {
  const { dataDir } = options
  const base = options.url.replace(/\/+$/, '')
  const log = options.log ?? (() => {})
  const debounceMs = options.debounceMs ?? 30_000
  const concurrency = options.concurrency ?? 8
  const dbPath = join(dataDir, 'unlighthouse.db')
  const blobRoot = join(dataDir, 'blobs')
  const known = new Map<string, string>()
  let restoreComplete = false
  let chain: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null

  const keyUrl = (key: string) => `${base}/${key.split('/').map(encodeURIComponent).join('/')}`

  async function call(method: string, key: string, body?: Uint8Array): Promise<Response> {
    const headers: Record<string, string> = {}
    if (options.token)
      headers['authorization'] = `Bearer ${options.token}`
    const response = await fetch(keyUrl(key), { method, headers, ...(body ? { body: body as Uint8Array<ArrayBuffer> } : {}) })
    if (!response.ok && !(method === 'GET' && response.status === 404) && !(method === 'DELETE' && response.status === 404))
      throw new Error(`${method} ${key} failed with HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
    return response
  }

  async function list(prefix: string): Promise<string[]> {
    const headers: Record<string, string> = {}
    if (options.token)
      headers['authorization'] = `Bearer ${options.token}`
    const response = await fetch(`${base}/?prefix=${encodeURIComponent(prefix)}`, { headers })
    if (!response.ok)
      throw new Error(`Listing ${prefix} failed with HTTP ${response.status}`)
    const { keys } = await response.json() as { keys: string[] }
    return keys
  }

  function localPath(key: string): string {
    const path = join(dataDir, ...key.split('/'))
    if (relative(dataDir, path).startsWith('..'))
      throw new Error(`Refusing a remote key outside the data directory: ${key}`)
    return path
  }

  function keyOf(path: string): string {
    return relative(dataDir, path).split(sep).join('/')
  }

  async function restoreDatabase(): Promise<void> {
    const response = await call('GET', DB_KEY)
    if (response.status === 404) {
      log('sync: no remote database yet; starting empty')
      return
    }
    const data = Bun.gunzipSync(new Uint8Array(await response.arrayBuffer()))
    mkdirSync(dataDir, { recursive: true })
    for (const suffix of ['-wal', '-shm'])
      rmSync(`${dbPath}${suffix}`, { force: true })
    writeFileSync(`${dbPath}.restore.tmp`, data)
    renameSync(`${dbPath}.restore.tmp`, dbPath)
    log(`sync: restored ${DB_KEY} (${data.byteLength} bytes)`)
  }

  async function restoreBlobs(): Promise<void> {
    const keys = await list(BLOB_PREFIX)
    let fetched = 0
    await pool(keys, concurrency, async (key) => {
      const path = localPath(key)
      if (!existsSync(path)) {
        const response = await call('GET', key)
        if (response.status === 404)
          return
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(`${path}.${process.pid}.tmp`, new Uint8Array(await response.arrayBuffer()))
        renameSync(`${path}.${process.pid}.tmp`, path)
        fetched++
      }
      known.set(key, signature(path))
    })
    restoreComplete = true
    log(`sync: restored ${fetched} blob(s)`)
  }

  function snapshot(): { data: Uint8Array, state: RemoteState } | null {
    if (!existsSync(dbPath))
      return null
    const temp = join(dataDir, `unlighthouse.snapshot.${process.pid}.tmp`)
    rmSync(temp, { force: true })
    const source = new Database(dbPath, { readwrite: true })
    try {
      source.run('PRAGMA busy_timeout = 5000')
      source.run(`VACUUM INTO '${temp.replaceAll('\'', '\'\'')}'`)
    }
    finally {
      source.close()
    }
    let nextRunAt: number | null = null
    const copy = new Database(temp, { readonly: true })
    try {
      const row = copy.query<{ next: number | null }, []>('SELECT MIN(next_run_at) AS next FROM schedules WHERE enabled = 1 AND next_run_at IS NOT NULL').get()
      nextRunAt = row?.next ?? null
    }
    catch {}
    finally {
      copy.close()
    }
    const data = Bun.gzipSync(new Uint8Array(readFileSync(temp)))
    rmSync(temp, { force: true })
    return { data, state: { syncedAt: Date.now(), nextRunAt } }
  }

  async function upload(): Promise<void> {
    const started = Date.now()
    const seen = new Set<string>()
    const changed: string[] = []
    for (const path of walk(blobRoot)) {
      const key = keyOf(path)
      seen.add(key)
      if (known.get(key) !== signature(path))
        changed.push(path)
    }
    await pool(changed, concurrency, async (path) => {
      const sig = signature(path)
      await call('PUT', keyOf(path), new Uint8Array(readFileSync(path)))
      known.set(keyOf(path), sig)
    })
    const snap = snapshot()
    if (snap) {
      await call('PUT', DB_KEY, snap.data)
      await call('PUT', STATE_KEY, new TextEncoder().encode(JSON.stringify(snap.state)))
    }
    const removed = restoreComplete ? [...known.keys()].filter(key => !seen.has(key)) : []
    await pool(removed, concurrency, async (key) => {
      await call('DELETE', key)
      known.delete(key)
    })
    log(`sync: uploaded ${changed.length} blob(s)${snap ? ` and the database (${snap.data.byteLength} bytes gzipped)` : ''}, removed ${removed.length}, in ${Date.now() - started} ms`)
  }

  function flush(): Promise<void> {
    if (timer)
      clearTimeout(timer)
    timer = null
    const run = chain.then(() => blobsRestored.catch(() => {})).then(upload)
    chain = run.catch((error) => {
      log(`sync: upload failed: ${message(error)}`)
    })
    return run
  }

  function later(): void {
    if (timer)
      clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      flush().catch(() => {})
    }, debounceMs)
  }

  await restoreDatabase()
  const blobsRestored = restoreBlobs()
  blobsRestored.catch(error => log(`sync: blob restore failed; deletions will not be synced until the next start: ${message(error)}`))

  return {
    blobsRestored,
    watch(bus) {
      return bus.on((event) => {
        if (event.type === 'scan:status' && (event.status === 'done' || event.status === 'failed' || event.status === 'cancelled'))
          flush().catch(() => {})
        else if (event.type === 'page:status' && (event.status === 'done' || event.status === 'failed'))
          later()
      })
    },
    flush,
    async close() {
      if (timer)
        clearTimeout(timer)
      timer = null
      await flush().catch(() => {})
    },
  }
}
