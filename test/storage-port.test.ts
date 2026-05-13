import type { ExtractedMetrics, Scan, ScanId, ScanInsert, Storage } from '../packages/contracts/src'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { memoryStorage } from '../packages/core/src/storage/memory'
import { drizzleStorage } from '../packages/core/src/storage/drizzle'

const INIT_SQL = readFileSync(
  resolve(__dirname, '../packages/core/migrations/sqlite/0000_init.sql'),
  'utf8',
)

function makeDrizzleStorage(): Storage {
  const sqlite = new Database(':memory:')
  // Apply schema. Migration file uses --> statement-breakpoint markers from drizzle-kit.
  for (const stmt of INIT_SQL.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim()
    if (trimmed)
      sqlite.exec(trimmed)
  }
  const db = drizzle(sqlite)
  // Compose row repo with the memory blob store; drizzle adapter is row-only.
  const blobs = memoryStorage().blobs
  const rows = drizzleStorage({ driver: db })
  return { scans: rows.scans, routes: rows.routes, blobs }
}

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function makeScanInsert(overrides: Partial<ScanInsert> = {}): ScanInsert {
  const base: ScanInsert = {
    scanId: ('scan_' + Math.random().toString(36).slice(2, 10)) as ScanId,
    site: 'https://example.com',
    device: 'mobile',
    status: 'starting',
    startedAt: isoNow(),
    completedAt: null,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
  }
  return { ...base, ...overrides }
}

function makeMetrics(url: string): ExtractedMetrics {
  return {
    url,
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: 0.9,
    scoreAccessibility: 0.95,
    scoreSeo: 0.9,
    scoreBestPractices: 0.95,
    lcp: 1200,
    cls: 0.01,
    inp: 100,
    fcp: 800,
    ttfb: 200,
    tbt: 50,
    si: 1500,
    lighthouseVersion: '11.0.0',
    capturedAt: isoNow(),
  }
}

const backends: Array<[string, () => Storage]> = [
  ['memory', () => memoryStorage()],
  ['drizzle (better-sqlite3 :memory:)', makeDrizzleStorage],
]

describe.each(backends)('storage port — %s', (_name, createStorage) => {
  it('scans.create returns Scan with summary: null', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    const created = await s.scans.create(insert)
    expect(created.scanId).toBe(insert.scanId)
    expect(created.summary).toBeNull()
    expect(created.completedAt).toBeNull()
  })

  it('scans.get(unknown) returns null', async () => {
    const s = createStorage()
    const r = await s.scans.get('does_not_exist' as ScanId)
    expect(r).toBeNull()
  })

  it('scans.update patch merges; get returns merged', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    await s.scans.update(insert.scanId, { status: 'complete', completedAt: isoNow() })
    const after = await s.scans.get(insert.scanId)
    expect(after?.status).toBe('complete')
    expect(after?.completedAt).not.toBeNull()
    // unchanged fields preserved
    expect(after?.site).toBe(insert.site)
  })

  it('scans.list({ site }) filters by site, paginates', async () => {
    const s = createStorage()
    await s.scans.create(makeScanInsert({ site: 'https://a.test', startedAt: isoNow(-5000) }))
    await s.scans.create(makeScanInsert({ site: 'https://a.test', startedAt: isoNow(-3000) }))
    await s.scans.create(makeScanInsert({ site: 'https://b.test', startedAt: isoNow(-1000) }))

    const all = await s.scans.list({ site: 'https://a.test' })
    expect(all.items.length).toBe(2)
    expect(all.total).toBe(2)
    expect(all.page).toBe(1)
    expect(all.pageSize).toBeGreaterThan(0)
    for (const item of all.items)
      expect(item.site).toBe('https://a.test')

    const paged = await s.scans.list({ site: 'https://a.test', page: 1, pageSize: 1 })
    expect(paged.items.length).toBe(1)
    expect(paged.total).toBe(2)
  })

  it('scans.findPrevious excludes given scanId; returns most recent same-site/device complete', async () => {
    const s = createStorage()
    const older = makeScanInsert({ site: 'https://x.test', status: 'complete', startedAt: isoNow(-10_000) })
    const newer = makeScanInsert({ site: 'https://x.test', status: 'complete', startedAt: isoNow(-5_000) })
    const current = makeScanInsert({ site: 'https://x.test', status: 'complete', startedAt: isoNow() })
    await s.scans.create(older)
    await s.scans.create(newer)
    await s.scans.create(current)

    const prev = await s.scans.findPrevious({
      site: 'https://x.test',
      device: 'mobile',
      excludeScanId: current.scanId,
    })
    expect(prev?.scanId).toBe(newer.scanId)
  })

  it('scans.delete removes scan; routes for that scan also gone', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    await s.routes.putBatch(insert.scanId, [makeMetrics('https://example.com/a')])
    await s.scans.delete(insert.scanId)
    expect(await s.scans.get(insert.scanId)).toBeNull()
    const remaining = await s.routes.listForScan(insert.scanId)
    expect(remaining.items).toEqual([])
    expect(remaining.total).toBe(0)
  })

  it('routes.putBatch 50 rows; listForScan returns all 50', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    const rows = Array.from({ length: 50 }, (_, i) => makeMetrics(`https://example.com/p/${i}`))
    await s.routes.putBatch(insert.scanId, rows)
    const out = await s.routes.listForScan(insert.scanId, { pageSize: 100 })
    expect(out.items.length).toBe(50)
    expect(out.total).toBe(50)
  })

  it('routes.upsert second call for same url overwrites prior', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    const url = 'https://example.com/dup'
    await s.routes.upsert(insert.scanId, { ...makeMetrics(url), scorePerformance: 0.1 })
    await s.routes.upsert(insert.scanId, { ...makeMetrics(url), scorePerformance: 0.9 })
    const got = await s.routes.get(insert.scanId, url)
    expect(got?.scorePerformance).toBe(0.9)
    const list = await s.routes.listForScan(insert.scanId)
    expect(list.total).toBe(1)
  })

  it('routes.get returns single row', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    const url = 'https://example.com/one'
    await s.routes.upsert(insert.scanId, makeMetrics(url))
    const row = await s.routes.get(insert.scanId, url)
    expect(row?.url).toBe(url)
    expect(row?.scanId).toBe(insert.scanId)
  })

  it('routes.delete(scanId) clears all rows for that scan', async () => {
    const s = createStorage()
    const insert = makeScanInsert()
    await s.scans.create(insert)
    await s.routes.putBatch(insert.scanId, [
      makeMetrics('https://example.com/a'),
      makeMetrics('https://example.com/b'),
    ])
    await s.routes.delete(insert.scanId)
    const list = await s.routes.listForScan(insert.scanId)
    expect(list.total).toBe(0)
  })

  it('blobs.put/get/has/delete roundtrip Uint8Array', async () => {
    const s = createStorage()
    const key = 'k/test.bin'
    const data = new Uint8Array([1, 2, 3, 4, 5])
    expect(await s.blobs.has(key)).toBe(false)
    await s.blobs.put(key, data)
    expect(await s.blobs.has(key)).toBe(true)
    const got = await s.blobs.get(key)
    expect(got).toBeInstanceOf(Uint8Array)
    expect(Array.from(got!)).toEqual([1, 2, 3, 4, 5])
    await s.blobs.delete(key)
    expect(await s.blobs.has(key)).toBe(false)
    expect(await s.blobs.get(key)).toBeNull()
  })

  // satisfy unused-import lint
  void ({} as Scan)
})
