// D-035 — Cloudflare Worker host reaches command-surface parity on D1/R2.
//
// Proves that with the real `d1R2Storage` (shared Drizzle repositories + R2
// blobs) the Worker host returns data
// for: compare.* , pack.run drill-ins, dashboard detail views, the on-demand
// comparison persist/read path, and CrUX reads.
//
// The D1 handle here is better-sqlite3 wearing the D1Database interface (D1 is
// sqlite, so the exact same SQL runs). A real miniflare/workerd test is the
// documented follow-up — see packages/cloudflare/examples/basic/README.md.

import type { ScanInsert } from '@unlighthouse/contracts/ports'
import type { ExtractedMetrics, ScanId, Storage } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { scanCrux } from '@unlighthouse/contracts/drizzle'
import { parseScanId, parseUrl } from '@unlighthouse/contracts/types/atoms'
import {
  compareDetail,
  compareRun,
  scanResults,
} from '@unlighthouse/core/api/handlers'
import { compareScans } from '@unlighthouse/core/comparison'
import { asDrizzleDatabase } from '@unlighthouse/core/storage/drizzle'
import { beforeAll, describe, expect, it } from 'vitest'
import { d1R2Storage, migrate } from '../src/storage/d1-r2'
import { createTestD1, createTestR2 } from './helpers/d1-better-sqlite3'

function metrics(url: string, path: string, perf: number, lcp: number): ExtractedMetrics {
  return {
    url: parseUrl(url),
    path,
    routeName: null,
    scorePerformance: perf,
    scoreAccessibility: 0.9,
    scoreSeo: 0.9,
    scoreBestPractices: 0.9,
    scoreAgenticBrowsing: null,
    lcp,
    cls: 0.05,
    inp: 100,
    fcp: 800,
    ttfb: 200,
    tbt: 150,
    si: 1200,
    lighthouseVersion: '13.0.0',
    auditor: 'mock',
    capturedAt: new Date().toISOString(),
  }
}

function scanInsert(scanId: string, startedAt: string): ScanInsert {
  return {
    scanId: parseScanId(scanId),
    siteId: null,
    site: parseUrl('https://example.com'),
    mode: 'site',
    device: 'mobile',
    status: 'complete',
    startedAt,
    completedAt: startedAt,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: {
      routes: 2,
      completed: 2,
      failed: 0,
      scoreAverage: 0.8,
      scoresByCategory: { performance: 0.8 },
      durationMs: 1000,
      devices: ['mobile'],
    },
  }
}

function handlerCtx(storage: Storage): HandlerCtx {
  const config = UnlighthouseConfigSchema.parse({ site: 'https://example.com', scanner: {} })
  return {
    storage,
    core: { hooks: undefined, session: () => null, run: () => { throw new Error('unused') } } as unknown as HandlerCtx['core'],
    auditor: { audit: async () => { throw new Error('unused') }, capabilities: {} } as unknown as HandlerCtx['auditor'],
    config,
    version: 'test',
  }
}

describe('d1R2Storage — Worker host command-surface parity (D-035)', () => {
  let storage: Storage
  let ctx: HandlerCtx
  const baseId = 'scan_base00000000000000000000000'
  const currentId = 'scan_curr00000000000000000000000'
  let baseScanId: ScanId
  let currentScanId: ScanId
  let raw: ReturnType<typeof createTestD1>['raw']

  beforeAll(async () => {
    const testD1 = createTestD1()
    const { db } = testD1
    raw = testD1.raw
    const bucket = createTestR2()
    await migrate(db)
    storage = d1R2Storage({ db, bucket })
    ctx = handlerCtx(storage)

    baseScanId = parseScanId(baseId)
    currentScanId = parseScanId(currentId)

    await storage.scans.create(scanInsert(baseId, '2026-07-01T00:00:00.000Z'))
    await storage.scans.create(scanInsert(currentId, '2026-07-02T00:00:00.000Z'))

    // Base: fast. Current: regressed perf + LCP on /about.
    await storage.routes.putBatch(baseScanId, 'mobile', [
      metrics('https://example.com/', '/', 0.95, 1800),
      metrics('https://example.com/about', '/about', 0.9, 2000),
    ])
    await storage.routes.putBatch(currentScanId, 'mobile', [
      metrics('https://example.com/', '/', 0.95, 1800),
      metrics('https://example.com/about', '/about', 0.6, 4500),
    ])
  })

  it('compare.run returns regressions computed from D1 routes', async () => {
    const out = await compareRun.run({ baseScanId, currentScanId }, ctx)
    expect(out.regressions.length).toBeGreaterThan(0)
    const lcpRegression = out.regressions.find(r => r.metric === 'lcp' && r.url.endsWith('/about'))
    expect(lcpRegression).toBeDefined()
    expect(out.summary?.totalRegressions).toBe(out.regressions.length)
  })

  it('compare.detail returns per-route drill-in rows from D1', async () => {
    const out = await compareDetail.run({ baseScanId, currentScanId }, ctx)
    expect(out.routes.items.length).toBeGreaterThan(0)
    expect(out.summary.regressedRoutes).toBeGreaterThan(0)
  })

  it('dashboard detail (scan.results) returns route rows from D1', async () => {
    const out = await scanResults.run({ scanId: currentScanId, page: 1, pageSize: 100 }, ctx)
    expect(out.total).toBe(2)
    expect(out.items.map(r => r.path).sort()).toEqual(['/', '/about'])
  })

  it('round-trips persisted siteId and page mode through shared repositories', async () => {
    const siteId = 'https://example.com'
    await storage.sites.create({
      id: siteId,
      name: 'Example',
      url: siteId,
      group: null,
      createdAt: '2026-07-03T00:00:00.000Z',
    })
    const pageScanId = parseScanId('scan_page00000000000000000000000')
    await storage.scans.create({
      ...scanInsert(pageScanId, '2026-07-03T00:00:00.000Z'),
      siteId,
      mode: 'page',
    })

    expect(await storage.scans.get(pageScanId)).toMatchObject({ siteId, mode: 'page' })
  })

  it('rolls back the entire D1 route batch when one statement fails', async () => {
    const scanId = parseScanId('scan_batch0000000000000000000000')
    await storage.scans.create(scanInsert(scanId, '2026-07-04T00:00:00.000Z'))
    raw.exec(`CREATE TRIGGER reject_route BEFORE INSERT ON scan_routes
      WHEN NEW.path = '/reject' BEGIN SELECT RAISE(ABORT, 'rejected route'); END`)

    await expect(storage.routes.putBatch(scanId, 'mobile', [
      metrics('https://example.com/accepted', '/accepted', 0.9, 1800),
      metrics('https://example.com/reject', '/reject', 0.9, 1800),
    ])).rejects.toThrow('rejected route')

    expect((await storage.routes.listForScan(scanId)).items).toHaveLength(0)
    raw.exec('DROP TRIGGER reject_route')
  })

  // The shared Drizzle route writer persists D-040 provenance + the D-034 reconciled
  // report_blob_key, so route.get's reconciled deep-dive resolves on the Worker
  // host (parity with the drizzle better-sqlite3 writer).
  it('d1 route writer persists auditor + report_blob_key (D-040/D-034 parity)', async () => {
    const out = await scanResults.run({ scanId: currentScanId, page: 1, pageSize: 100 }, ctx)
    for (const row of out.items) {
      expect(row.auditor).toBe('mock')
      expect(row.reportBlobKey).toMatch(/^scans\/.+\/reports\/.+\.json$/)
    }
  })

  it('pack.run drill-in returns a cached pack report from the D1 pack_runs repo', async () => {
    const report = { schemaVersion: 1, findings: [{ id: 'x', title: 'demo' }] }
    await storage.packRuns.put({
      scanId: currentScanId,
      packName: 'overview',
      packVersion: '1.0.0',
      startedAt: '2026-07-02T00:00:01.000Z',
      completedAt: '2026-07-02T00:00:02.000Z',
      report,
      reportBlobKey: null,
    })
    const cached = await storage.packRuns.get(currentScanId, 'overview', '1.0.0')
    expect(cached?.report).toEqual(report)
    const listed = await storage.packRuns.listForScan(currentScanId)
    expect(listed.map(p => p.packName)).toContain('overview')
  })

  it('comparisons repo persists + reads through the shared drizzle code path', async () => {
    // compareScans is the on-demand persist path (CI/agent). It writes the
    // comparison + diff rows via the D1 drizzle handle; the comparisons repo
    // reads them back — proving full parity, not a stub.
    const written = await compareScans(storage.db, baseId, currentId)
    expect(written.regressed).toBeGreaterThan(0)

    const latest = await storage.comparisons.latestForCurrent(currentScanId) as
      | { id: number, regressed: number, diffs: unknown[] }
      | null
    expect(latest).not.toBeNull()
    expect(latest!.regressed).toBeGreaterThan(0)
    expect(latest!.diffs.length).toBeGreaterThan(0)

    const listed = await storage.comparisons.list({ currentScanId })
    expect(listed.length).toBe(1)
    const diffs = await storage.comparisons.diffs(latest!.id)
    expect(diffs.length).toBe(latest!.diffs.length)
  })

  it('reports.crux repo reads CrUX rows written through the D1 drizzle handle', async () => {
    await asDrizzleDatabase(storage.db).insert(scanCrux).values({
      scanId: currentId,
      hostname: 'example.com',
      formFactor: 'PHONE',
      seriesJson: JSON.stringify({ lcp: [1], inp: [], cls: [] }),
      fetchedAt: new Date(),
    })
    const rows = await storage.reports.crux.list(currentScanId) as Array<{ hostname: string }>
    expect(rows.length).toBe(1)
    expect(rows[0]!.hostname).toBe('example.com')
  })
})
