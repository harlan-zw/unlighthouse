// D-029: compare.run and assert.evaluate must respect (url, device) row
// identity. Before this fix, both handlers built a Map<url, ScanRoute> as
// their base→current join, which silently collapsed matrix rows: a mobile
// regression and a desktop improvement on the same URL would cancel out
// (whichever row landed in the map last won).
//
// These tests exercise the matrix path end-to-end via memoryStorage so
// the (url, device) key is verified at the row-store layer too.

import type { ScanId, Storage } from '@unlighthouse/contracts'
import type { ExtractedMetrics } from '@unlighthouse/contracts/types/atoms'
import { compareDetail, compareRun } from '@unlighthouse/core/api/handlers'
import { assertEvaluate } from '@unlighthouse/core/api/handlers'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeAll, describe, expect, it } from 'vitest'
import { testConfig, testHandlerCtx } from './helpers/contracts'

// ── Fixture: matrix scan + a second matrix scan with patched rows ───────────

async function runMatrixScan(storage: Storage): Promise<ScanId> {
  const core = createUnlighthouseCore({
    config: testConfig({ site: 'http://example.com' }),
    auditor: createMockAuditor(),
    seeds: manualSeeds({ urls: ['http://example.com/'] }),
    crawler: parallelMapCrawler({ concurrency: 1 }),
    storage,
  })
  const session = core.run({ overrides: { device: ['mobile', 'desktop'] } })
  await session.done
  return session.scanId
}

// Patch one route's metric. Returns nothing — `routes.upsert` is idempotent
// so this just rewrites the row in place under its (scanId, url, device) PK.
async function patchRouteMetric(
  storage: Storage,
  scanId: ScanId,
  url: string,
  device: 'mobile' | 'desktop',
  patch: Partial<ExtractedMetrics>,
) {
  const row = await storage.routes.get(scanId, url, device)
  if (!row)
    throw new Error(`row not found: ${url}@${device}`)
  await storage.routes.upsert(scanId, device, {
    ...row,
    ...patch,
  })
}

// ── compare ────────────────────────────────────────────────────────────────

describe('compare.run respects (url, device) identity', () => {
  let storage: Storage
  let baseScanId: ScanId
  let currentScanId: ScanId

  beforeAll(async () => {
    storage = memoryStorage()
    baseScanId = await runMatrixScan(storage)
    currentScanId = await runMatrixScan(storage)
    // Regress LCP on mobile only. Desktop stays unchanged → desktop should
    // NOT show up as a regression after the fix.
    await patchRouteMetric(storage, currentScanId, 'http://example.com/', 'mobile', { lcp: 4500 })
  })

  it('mobile regression is reported with device dimension; desktop stays clean', async () => {
    const out = await compareRun.run(
      { baseScanId, currentScanId },
      testHandlerCtx(storage),
    )

    const mobileLcp = out.regressions.filter(r => r.metric === 'lcp' && r.device === 'mobile')
    const desktopLcp = out.regressions.filter(r => r.metric === 'lcp' && r.device === 'desktop')

    expect(mobileLcp).toHaveLength(1)
    expect(mobileLcp[0].url).toBe('http://example.com/')
    expect(mobileLcp[0].base).toBe(1200) // mock mobile baseline
    expect(mobileLcp[0].current).toBe(4500)
    expect(desktopLcp).toHaveLength(0)
  })

  it('every diff carries a device — schema is honored', async () => {
    const out = await compareRun.run(
      { baseScanId, currentScanId },
      testHandlerCtx(storage),
    )
    for (const diff of [...out.regressions, ...out.improvements])
      expect(diff.device).toMatch(/^(mobile|desktop)$/)
  })
})

// ── assert: maxRegression ──────────────────────────────────────────────────

describe('assert.evaluate maxRegression respects (url, device) identity', () => {
  let storage: Storage
  let baseScanId: ScanId
  let currentScanId: ScanId

  beforeAll(async () => {
    storage = memoryStorage()
    baseScanId = await runMatrixScan(storage)
    currentScanId = await runMatrixScan(storage)
  })

  it('does NOT see a regression when desktop improves and mobile stays flat', async () => {
    // Pre-fix: baseByUrl[url] would hold whichever device wrote last
    // (desktop, after the loop). For the mobile row, base would be the
    // desktop row → a "regression" of ~600ms LCP would surface even though
    // mobile didn't move at all.
    const out = await assertEvaluate.run(
      {
        scanId: currentScanId,
        baselineScanId: baseScanId,
        assertions: [{ type: 'maxRegression', metric: 'lcp', value: 100 }],
      },
      testHandlerCtx(storage),
    )
    // Both scans use the same mock — mobile=1200, desktop=600. Per (url,
    // device) join: 0 regression. Pre-fix bug would have surfaced one.
    expect(out.passed).toBe(true)
    expect(out.results[0].actual).toBe(0)
  })

  it('evaluates agentic-browsing scores through the shared category map', async () => {
    const isolatedStorage = memoryStorage()
    const scanId = await runMatrixScan(isolatedStorage)
    await patchRouteMetric(isolatedStorage, scanId, 'http://example.com/', 'mobile', { scoreAgenticBrowsing: 0.42 })

    const out = await assertEvaluate.run(
      {
        scanId,
        assertions: [{ type: 'minScore', category: 'agentic-browsing', value: 0.5 }],
      },
      testHandlerCtx(isolatedStorage),
    )

    expect(out.passed).toBe(false)
    expect(out.results[0].actual).toBe(0.42)
  })

  it('includes agentic-browsing in compare.detail route deltas', async () => {
    const isolatedStorage = memoryStorage()
    const baseScanId = await runMatrixScan(isolatedStorage)
    const currentScanId = await runMatrixScan(isolatedStorage)
    await patchRouteMetric(isolatedStorage, baseScanId, 'http://example.com/', 'mobile', { scoreAgenticBrowsing: 0.9 })
    await patchRouteMetric(isolatedStorage, currentScanId, 'http://example.com/', 'mobile', { scoreAgenticBrowsing: 0.6 })

    const out = await compareDetail.run(
      {
        baseScanId,
        currentScanId,
        sort: 'delta-agentic-asc',
        filter: { status: 'all' },
      },
      testHandlerCtx(isolatedStorage),
    )

    const row = out.routes.items.find(r => r.url === 'http://example.com/' && r.device === 'mobile')
    expect(row?.base?.scoreAgenticBrowsing).toBe(0.9)
    expect(row?.current?.scoreAgenticBrowsing).toBe(0.6)
    expect(row?.deltas.scoreAgenticBrowsing).toBeCloseTo(-0.3)
  })
})
