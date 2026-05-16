// D-029: compare.run and assert.evaluate must respect (url, device) row
// identity. Before this fix, both handlers built a Map<url, ScanRoute> as
// their base→current join, which silently collapsed matrix rows: a mobile
// regression and a desktop improvement on the same URL would cancel out
// (whichever row landed in the map last won).
//
// These tests exercise the matrix path end-to-end via memoryStorage so
// the (url, device) key is verified at the row-store layer too.

import type { Storage } from '@unlighthouse/contracts'
import { compareRun } from '@unlighthouse/core/api/handlers/compare'
import { assertEvaluate } from '@unlighthouse/core/api/handlers/assert'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeAll, describe, expect, it } from 'vitest'

// ── Fixture: matrix scan + a second matrix scan with patched rows ───────────

async function runMatrixScan(storage: Storage): Promise<string> {
  const core = createUnlighthouseCore({
    config: { site: 'http://example.com' } as never,
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
  scanId: string,
  url: string,
  device: 'mobile' | 'desktop',
  patch: Record<string, number | null>,
) {
  const row = await storage.routes.get(scanId as never, url, device)
  if (!row)
    throw new Error(`row not found: ${url}@${device}`)
  await storage.routes.upsert(scanId as never, device, {
    ...row,
    ...patch,
  } as never)
}

const makeCtx = (storage: Storage) => ({
  storage,
  core: { hooks: undefined } as never,
  auditor: createMockAuditor(),
} as never)

// ── compare ────────────────────────────────────────────────────────────────

describe('compare.run respects (url, device) identity', () => {
  let storage: Storage
  let baseScanId: string
  let currentScanId: string

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
      { baseScanId: baseScanId as never, currentScanId: currentScanId as never },
      makeCtx(storage),
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
      { baseScanId: baseScanId as never, currentScanId: currentScanId as never },
      makeCtx(storage),
    )
    for (const diff of [...out.regressions, ...out.improvements])
      expect(diff.device).toMatch(/^(mobile|desktop)$/)
  })
})

// ── assert: maxRegression ──────────────────────────────────────────────────

describe('assert.evaluate maxRegression respects (url, device) identity', () => {
  let storage: Storage
  let baseScanId: string
  let currentScanId: string

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
        scanId: currentScanId as never,
        baselineScanId: baseScanId as never,
        assertions: [{ type: 'maxRegression', metric: 'lcp', value: 100 }],
      } as never,
      makeCtx(storage),
    )
    // Both scans use the same mock — mobile=1200, desktop=600. Per (url,
    // device) join: 0 regression. Pre-fix bug would have surfaced one.
    expect(out.passed).toBe(true)
    expect(out.results[0].actual).toBe(0)
  })
})
