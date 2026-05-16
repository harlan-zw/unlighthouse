// D-029: command-input device filters. Routes are PK'd on (scanId, url,
// device) so commands that look up or list routes need to thread the
// caller's device choice through to storage.

import type { Storage } from '@unlighthouse/contracts'
import { packRun } from '@unlighthouse/core/api/handlers/pack'
import { routeGet, routeRescan } from '@unlighthouse/core/api/handlers/route'
import { scanResults } from '@unlighthouse/core/api/handlers/scan'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeAll, describe, expect, it } from 'vitest'

async function runMatrixScan(storage: Storage): Promise<string> {
  const core = createUnlighthouseCore({
    config: { site: 'http://example.com' } as never,
    auditor: createMockAuditor(),
    seeds: manualSeeds({ urls: ['http://example.com/', 'http://example.com/about'] }),
    crawler: parallelMapCrawler({ concurrency: 1 }),
    storage,
  })
  const session = core.run({ overrides: { device: ['mobile', 'desktop'] } })
  await session.done
  return session.scanId
}

const makeCtx = (storage: Storage) => ({
  storage,
  core: { hooks: undefined } as never,
  auditor: createMockAuditor(),
} as never)

// ── route.get ──────────────────────────────────────────────────────────────

describe('route.get accepts device input', () => {
  let storage: Storage
  let scanId: string

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('returns the requested device row', async () => {
    const desktop = await routeGet.run(
      { scanId: scanId as never, url: 'http://example.com/' as never, device: 'desktop' },
      makeCtx(storage),
    )
    expect(desktop.route.device).toBe('desktop')
    expect(desktop.route.scorePerformance).toBe(0.98) // mock desktop bump

    const mobile = await routeGet.run(
      { scanId: scanId as never, url: 'http://example.com/' as never, device: 'mobile' },
      makeCtx(storage),
    )
    expect(mobile.route.device).toBe('mobile')
    expect(mobile.route.scorePerformance).toBe(0.9)
  })

  it('falls back to the scan primary device when input.device is omitted', async () => {
    const out = await routeGet.run(
      { scanId: scanId as never, url: 'http://example.com/' as never },
      makeCtx(storage),
    )
    // The matrix above is ['mobile', 'desktop'] so primary = 'mobile'.
    expect(out.route.device).toBe('mobile')
  })
})

// ── scan.results ───────────────────────────────────────────────────────────

describe('scan.results accepts device input', () => {
  let storage: Storage
  let scanId: string

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('without device returns every (url, device) row', async () => {
    const out = await scanResults.run(
      { scanId: scanId as never, page: 1, pageSize: 50 } as never,
      makeCtx(storage),
    )
    // 2 URLs × 2 devices.
    expect(out.total).toBe(4)
  })

  it('with device filter returns only matching rows', async () => {
    const out = await scanResults.run(
      { scanId: scanId as never, device: 'desktop', page: 1, pageSize: 50 } as never,
      makeCtx(storage),
    )
    expect(out.total).toBe(2)
    expect(out.items.every(r => r.device === 'desktop')).toBe(true)
  })
})

// ── pack.run ───────────────────────────────────────────────────────────────

describe('pack.run accepts device input', () => {
  let storage: Storage
  let scanId: string

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('device-specific run caches separately from the no-device aggregate run', async () => {
    const mobile = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'mobile' } as never,
      makeCtx(storage),
    )
    expect(mobile.cache).toBe('miss')

    const desktop = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'desktop' } as never,
      makeCtx(storage),
    )
    // Different device → different cache row → miss, not hit.
    expect(desktop.cache).toBe('miss')

    // Re-calling mobile hits cache.
    const mobile2 = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'mobile' } as never,
      makeCtx(storage),
    )
    expect(mobile2.cache).toBe('hit')
  })

  it('reports scores reflect the device the pack saw', async () => {
    const mobile = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'mobile', refresh: true } as never,
      makeCtx(storage),
    )
    const desktop = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'desktop', refresh: true } as never,
      makeCtx(storage),
    )
    // overview pack aggregates per-category averages. Mock desktop perf is
    // 0.98 vs mobile 0.9 — the gap should surface in the pack report too.
    const mobileReport = mobile.report as { categoryAverages: { performance: number } }
    const desktopReport = desktop.report as { categoryAverages: { performance: number } }
    expect(desktopReport.categoryAverages.performance).toBeGreaterThan(
      mobileReport.categoryAverages.performance,
    )
  })

  it('wire packName is the bare pack id even when device cache key is mangled', async () => {
    const out = await packRun.run(
      { scanId: scanId as never, pack: 'overview', device: 'mobile' } as never,
      makeCtx(storage),
    )
    // Internal cache key is 'overview@mobile' but the wire stays 'overview'.
    expect(out.packName).toBe('overview')
  })
})

// ── route.rescan ───────────────────────────────────────────────────────────

describe('route.rescan accepts device input', () => {
  it('re-audits the requested device row and threads device into AuditOpts', async () => {
    const storage = memoryStorage()
    const scanId = await runMatrixScan(storage)

    // Re-audit only the desktop row. Verify by reading back — should still
    // be marked device='desktop' with the desktop-shaped perf numbers.
    const out = await routeRescan.run(
      { scanId: scanId as never, url: 'http://example.com/' as never, device: 'desktop' },
      makeCtx(storage),
    )
    expect(out.url).toBe('http://example.com/')
    expect(out.metrics.scorePerformance).toBe(0.98)

    const reread = await storage.routes.get(scanId as never, 'http://example.com/', 'desktop')
    expect(reread?.device).toBe('desktop')
    // Mobile row is untouched.
    const mobile = await storage.routes.get(scanId as never, 'http://example.com/', 'mobile')
    expect(mobile?.scorePerformance).toBe(0.9)
  })
})
