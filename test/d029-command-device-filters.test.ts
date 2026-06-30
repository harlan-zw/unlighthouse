// D-029: command-input device filters. Routes are PK'd on (scanId, url,
// device) so commands that look up or list routes need to thread the
// caller's device choice through to storage.

import type { ScanId, Storage } from '@unlighthouse/contracts'
import { packRun } from '@unlighthouse/core/api/handlers'
import { routeRescan } from '@unlighthouse/core/api/handlers'
import { scanResults } from '@unlighthouse/core/api/handlers'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeAll, describe, expect, it } from 'vitest'
import { testConfig, testHandlerCtx, testUrl } from './helpers/contracts'

async function runMatrixScan(storage: Storage): Promise<ScanId> {
  const core = createUnlighthouseCore({
    config: testConfig({ site: 'http://example.com' }),
    auditor: createMockAuditor(),
    seeds: manualSeeds({ urls: ['http://example.com/', 'http://example.com/about'] }),
    crawler: parallelMapCrawler({ concurrency: 1 }),
    storage,
  })
  const session = core.run({ overrides: { device: ['mobile', 'desktop'] } })
  await session.done
  return session.scanId
}

// ── scan.results ───────────────────────────────────────────────────────────

describe('scan.results accepts device input', () => {
  let storage: Storage
  let scanId: ScanId

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('without device returns every (url, device) row', async () => {
    const out = await scanResults.run(
      { scanId, page: 1, pageSize: 50 },
      testHandlerCtx(storage),
    )
    // 2 URLs × 2 devices.
    expect(out.total).toBe(4)
  })

  it('with device filter returns only matching rows', async () => {
    const out = await scanResults.run(
      { scanId, device: 'desktop', page: 1, pageSize: 50 },
      testHandlerCtx(storage),
    )
    expect(out.total).toBe(2)
    expect(out.items.every(r => r.device === 'desktop')).toBe(true)
  })
})

// ── pack.run ───────────────────────────────────────────────────────────────

describe('pack.run accepts device input', () => {
  let storage: Storage
  let scanId: ScanId

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('device-specific run caches separately from the no-device aggregate run', async () => {
    const mobile = await packRun.run(
      { scanId, pack: 'overview', device: 'mobile' },
      testHandlerCtx(storage),
    )
    expect(mobile.cache).toBe('miss')

    const desktop = await packRun.run(
      { scanId, pack: 'overview', device: 'desktop' },
      testHandlerCtx(storage),
    )
    // Different device → different cache row → miss, not hit.
    expect(desktop.cache).toBe('miss')

    // Re-calling mobile hits cache.
    const mobile2 = await packRun.run(
      { scanId, pack: 'overview', device: 'mobile' },
      testHandlerCtx(storage),
    )
    expect(mobile2.cache).toBe('hit')
  })

  it('reports scores reflect the device the pack saw', async () => {
    const mobile = await packRun.run(
      { scanId, pack: 'overview', device: 'mobile', refresh: true },
      testHandlerCtx(storage),
    )
    const desktop = await packRun.run(
      { scanId, pack: 'overview', device: 'desktop', refresh: true },
      testHandlerCtx(storage),
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
      { scanId, pack: 'overview', device: 'mobile' },
      testHandlerCtx(storage),
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
      { scanId, url: testUrl('http://example.com/'), device: 'desktop' },
      testHandlerCtx(storage),
    )
    expect(out.url).toBe('http://example.com/')
    expect(out.metrics.scorePerformance).toBe(0.98)

    const reread = await storage.routes.get(scanId, 'http://example.com/', 'desktop')
    expect(reread?.device).toBe('desktop')
    // Mobile row is untouched.
    const mobile = await storage.routes.get(scanId, 'http://example.com/', 'mobile')
    expect(mobile?.scorePerformance).toBe(0.9)
  })
})
