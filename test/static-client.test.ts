// The static (offline) client serves the dashboard's read commands from an
// embedded snapshot via the real handlers + a seeded memory storage — no API.
// This pins the data layer behind `--build-static`.

import type { Scan, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { PackRun } from '@unlighthouse/contracts/packs'
import { buildStaticSnapshot, createStaticClient } from '@unlighthouse/core/api/static-client'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'

const SCAN_ID = 'scan-static-0001'

function makeScan(): Scan {
  return {
    scanId: SCAN_ID as Scan['scanId'],
    siteId: 'https://example.com',
    site: 'https://example.com',
    mode: 'site',
    device: 'mobile',
    status: 'complete',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: '2025-01-01T00:05:00.000Z',
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: {
      routes: 2,
      completed: 2,
      failed: 0,
      scoreAverage: 0.9,
      scoresByCategory: { performance: 0.9 },
      durationMs: 1234,
    },
  } as Scan
}

function makeRoute(path: string, perf: number): ScanRoute {
  return {
    url: `https://example.com${path}`,
    path,
    routeName: null,
    scorePerformance: perf,
    scoreAccessibility: 0.8,
    scoreSeo: 1,
    scoreBestPractices: 0.95,
    scoreAgenticBrowsing: null,
    lcp: 1200,
    cls: 0.01,
    inp: null,
    fcp: 1000,
    ttfb: null,
    tbt: 100,
    si: 1500,
    lighthouseVersion: '13.0.0',
    capturedAt: '2025-01-01T00:01:00.000Z',
    scanId: SCAN_ID as ScanRoute['scanId'],
    device: 'mobile',
    lhrBlobKey: `scans/${SCAN_ID}/lhr/abc-mobile.json.gz`,
    reportBlobKey: `scans/${SCAN_ID}/reports/abc-mobile.json`,
  } as ScanRoute
}

function makePackRun(): PackRun {
  return {
    scanId: SCAN_ID,
    packName: 'cwv',
    packVersion: '1.0.0',
    startedAt: '2025-01-01T00:02:00.000Z',
    completedAt: '2025-01-01T00:02:01.000Z',
    report: { metrics: [{ metric: 'lcp', p75: 1200, verdict: 'good' }] },
  } as unknown as PackRun
}

const config = { site: 'https://example.com', scanner: {}, routerPrefix: '/' } as unknown as UnlighthouseConfig

function makeClient() {
  return createStaticClient({
    scans: [makeScan()],
    routes: [makeRoute('/', 1), makeRoute('/about', 0.4)],
    blobs: {},
    packRuns: [makePackRun()],
    sites: [{ id: 'https://example.com', name: 'example.com', url: 'https://example.com', group: null, createdAt: '2025-01-01T00:00:00.000Z' }],
    config,
  })
}

describe('createStaticClient — offline read commands', () => {
  it('scan.results returns the seeded routes (with filter/sort/paging in-browser)', async () => {
    const api = makeClient()
    const all = await api['scan.results']({ scanId: SCAN_ID as never, page: 1, pageSize: 50 })
    expect(all.total).toBe(2)
    expect(all.items.map(r => r.path).sort()).toEqual(['/', '/about'])

    // Sort + filter run through the same handler/storage logic as the live API.
    const sorted = await api['scan.results']({ scanId: SCAN_ID as never, page: 1, pageSize: 50, sort: 'score-asc' as never })
    expect(sorted.items[0].path).toBe('/about') // perf 0.4 first
    const filtered = await api['scan.results']({ scanId: SCAN_ID as never, page: 1, pageSize: 50, filter: { urlPattern: '/about' } as never })
    expect(filtered.items.map(r => r.path)).toEqual(['/about'])
  })

  it('scan.meta returns scan metadata offline', async () => {
    const api = makeClient()
    const meta = await api['scan.meta']({ scanId: SCAN_ID as never })
    expect(meta.site).toBe('https://example.com')
    expect(meta.device).toBe('mobile')
  })

  it('sites.list and history.list resolve from the snapshot', async () => {
    const api = makeClient()
    const sites = await api['sites.list']({})
    expect(sites.sites.map(s => s.url)).toContain('https://example.com')

    const history = await api['history.list']({ site: 'https://example.com', page: 1, pageSize: 50 } as never)
    expect(history.items.map(s => s.scanId)).toContain(SCAN_ID)
  })

  it('pack.run returns the pre-seeded report as a cache hit (no API, no inflate)', async () => {
    const api = makeClient()
    const res = await api['pack.run']({ scanId: SCAN_ID as never, pack: 'cwv' } as never)
    expect(res.cache).toBe('hit')
    expect((res.report as { metrics: unknown[] }).metrics).toHaveLength(1)
  })

  it('write commands reject — a static report is frozen', async () => {
    const api = makeClient()
    await expect(api['scan.rescanAll']({ scanId: SCAN_ID as never })).rejects.toThrow(/static report/i)
    await expect(api['route.rescan']({ scanId: SCAN_ID as never, url: 'https://example.com/' } as never)).rejects.toThrow(/static report/i)
  })
})

describe('buildStaticSnapshot → createStaticClient round-trip', () => {
  it('collects a scan from storage and serves it back offline', async () => {
    // Seed a live-shaped storage the way a real scan leaves it.
    const storage = memoryStorage()
    await storage.scans.create(makeScan() as never)
    await storage.routes.putBatch(SCAN_ID as never, 'mobile' as never, [makeRoute('/', 1), makeRoute('/about', 0.4)] as never)
    await storage.packRuns.put(makePackRun())
    await storage.sites.create({ id: 'https://example.com', name: 'example.com', url: 'https://example.com', group: null, createdAt: '2025-01-01T00:00:00.000Z' })

    // Collect only already-cached packs (skip re-running, which needs LHR blobs).
    const snapshot = await buildStaticSnapshot({ storage, scanId: SCAN_ID, config, packs: [] })
    expect(snapshot.scans).toHaveLength(1)
    expect(snapshot.routes).toHaveLength(2)
    expect(snapshot.packRuns.map(p => p.packName)).toContain('cwv')
    expect(snapshot.sites).toHaveLength(1)

    // Feed the collected snapshot to the offline client — full producer→consumer.
    const api = createStaticClient(snapshot)
    const results = await api['scan.results']({ scanId: SCAN_ID as never, page: 1, pageSize: 50 })
    expect(results.total).toBe(2)
    const pack = await api['pack.run']({ scanId: SCAN_ID as never, pack: 'cwv' } as never)
    expect(pack.cache).toBe('hit')
  })
})
