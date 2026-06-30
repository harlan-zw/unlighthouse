// The static (offline) client serves the dashboard's read commands from an
// embedded snapshot via the real handlers + a seeded memory storage — no API.
// This pins the data layer behind `--build-static`.

import type { Scan, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { PackRun } from '@unlighthouse/contracts/packs'
import { buildStaticSnapshot, createStaticClient } from '@unlighthouse/core/api/static-client'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { testConfig, testScanId, testUrl } from './helpers/contracts'

const SCAN_ID = testScanId('scan-static-0001')
const SITE_URL = testUrl('https://example.com')

function makeScan(): Scan {
  return {
    scanId: SCAN_ID,
    siteId: 'https://example.com',
    site: SITE_URL,
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
  }
}

function makeRoute(path: string, perf: number): ScanRoute {
  return {
    url: testUrl(`https://example.com${path}`),
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
    scanId: SCAN_ID,
    device: 'mobile',
    lhrBlobKey: `scans/${SCAN_ID}/lhr/abc-mobile.json.gz`,
    reportBlobKey: `scans/${SCAN_ID}/reports/abc-mobile.json`,
  }
}

function makePackRun(): PackRun {
  return {
    scanId: SCAN_ID,
    packName: 'cwv',
    packVersion: '1.0.0',
    startedAt: '2025-01-01T00:02:00.000Z',
    completedAt: '2025-01-01T00:02:01.000Z',
    report: {
      scanId: SCAN_ID,
      routesAnalysed: 2,
      metrics: [{
        metric: 'lcp',
        p75: 1200,
        verdict: 'good',
        distribution: { good: 2, needsImprovement: 0, poor: 0, unknown: 0 },
        worstRoutes: [{ url: 'https://example.com/about', value: 1200 }],
      }],
      passesCoreWebVitals: true,
      topFixes: [],
    },
    reportBlobKey: null,
  }
}

const config = testConfig()

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
    const all = await api['scan.results']({ scanId: SCAN_ID, page: 1, pageSize: 50 })
    expect(all.total).toBe(2)
    expect(all.items.map(r => r.path).sort()).toEqual(['/', '/about'])

    // Sort + filter run through the same handler/storage logic as the live API.
    const sorted = await api['scan.results']({ scanId: SCAN_ID, page: 1, pageSize: 50, sort: 'score-asc' })
    expect(sorted.items[0].path).toBe('/about') // perf 0.4 first
    const filtered = await api['scan.results']({ scanId: SCAN_ID, page: 1, pageSize: 50, filter: { urlPattern: '/about' } })
    expect(filtered.items.map(r => r.path)).toEqual(['/about'])
  })

  it('scan.meta returns scan metadata offline', async () => {
    const api = makeClient()
    const meta = await api['scan.meta']({ scanId: SCAN_ID })
    expect(meta.site).toBe('https://example.com')
    expect(meta.device).toBe('mobile')
  })

  it('sites.list and history.list resolve from the snapshot', async () => {
    const api = makeClient()
    const sites = await api['sites.list']({})
    expect(sites.sites.map(s => s.url)).toContain('https://example.com')

    const history = await api['history.list']({ site: 'https://example.com', page: 1, pageSize: 50 })
    expect(history.items.map(s => s.scanId)).toContain(SCAN_ID)
  })

  it('pack.run returns the pre-seeded report as a cache hit (no API, no inflate)', async () => {
    const api = makeClient()
    const res = await api['pack.run']({ scanId: SCAN_ID, pack: 'cwv' })
    expect(res.cache).toBe('hit')
    expect((res.report as { metrics: unknown[] }).metrics).toHaveLength(1)
  })

  it('write commands reject — a static report is frozen', async () => {
    const api = makeClient()
    await expect(api['scan.rescanAll']({ scanId: SCAN_ID })).rejects.toThrow(/static report/i)
    await expect(api['route.rescan']({ scanId: SCAN_ID, url: testUrl('https://example.com/') })).rejects.toThrow(/static report/i)
  })
})

describe('buildStaticSnapshot → createStaticClient round-trip', () => {
  it('collects a scan from storage and serves it back offline', async () => {
    // Seed a live-shaped storage the way a real scan leaves it.
    const storage = memoryStorage()
    await storage.scans.create(makeScan())
    await storage.routes.putBatch(SCAN_ID, 'mobile', [makeRoute('/', 1), makeRoute('/about', 0.4)])
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
    const results = await api['scan.results']({ scanId: SCAN_ID, page: 1, pageSize: 50 })
    expect(results.total).toBe(2)
    const pack = await api['pack.run']({ scanId: SCAN_ID, pack: 'cwv' })
    expect(pack.cache).toBe('hit')
  })
})
