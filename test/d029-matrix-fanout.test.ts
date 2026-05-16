// D-029 runtime fan-out: a single scan exercises every URL on every device
// in the matrix and writes one ScanRoute row per (url, device).
//
// Mock auditor is device-aware (see auditors/mock.ts): desktop returns
// nudged-up perf scores so the two rows are observably different.

import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'

describe('D-029 matrix fan-out', () => {
  it('scans one URL on both devices → two rows, distinct scores per device', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: 'http://example.com' } as never,
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: ['http://example.com/'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const session = core.run({
      overrides: { device: ['mobile', 'desktop'] },
    })
    await session.done

    const rows = await storage.routes.listForScan(session.scanId, { pageSize: 100 })
    expect(rows.total).toBe(2)
    expect(rows.items.map(r => r.device).sort()).toEqual(['desktop', 'mobile'])

    const mobile = rows.items.find(r => r.device === 'mobile')!
    const desktop = rows.items.find(r => r.device === 'desktop')!
    // Mock auditor's desktop profile bumps perf score to 0.98 vs mobile 0.9.
    expect(mobile.scorePerformance).toBe(0.9)
    expect(desktop.scorePerformance).toBe(0.98)

    // Per-device blob keys exist for both rows.
    expect(mobile.lhrBlobKey).toContain('-mobile.json.gz')
    expect(desktop.lhrBlobKey).toContain('-desktop.json.gz')
    expect(await storage.blobs.has(mobile.lhrBlobKey)).toBe(true)
    expect(await storage.blobs.has(desktop.lhrBlobKey)).toBe(true)
  })

  it('listForScan with device filter returns only the requested device', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: 'http://example.com' } as never,
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: ['http://example.com/a', 'http://example.com/b'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const session = core.run({
      overrides: { device: ['mobile', 'desktop'] },
    })
    await session.done

    const all = await storage.routes.listForScan(session.scanId)
    expect(all.total).toBe(4) // 2 URLs × 2 devices

    const mobileOnly = await storage.routes.listForScan(session.scanId, { device: 'mobile' })
    expect(mobileOnly.total).toBe(2)
    expect(mobileOnly.items.every(r => r.device === 'mobile')).toBe(true)
  })

  it('Scan.device holds the first device in the matrix (primary device)', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: 'http://example.com' } as never,
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: ['http://example.com/'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const session = core.run({
      // desktop-first matrix → scan.device = 'desktop'.
      overrides: { device: ['desktop', 'mobile'] },
    })
    await session.done

    const scan = await storage.scans.get(session.scanId)
    expect(scan?.device).toBe('desktop')
  })

  it('single-device input still produces one row per URL (back-compat)', async () => {
    const storage = memoryStorage()
    const core = createUnlighthouseCore({
      config: { site: 'http://example.com' } as never,
      auditor: createMockAuditor(),
      seeds: manualSeeds({ urls: ['http://example.com/'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const session = core.run({
      overrides: { device: 'mobile' },
    })
    await session.done

    const rows = await storage.routes.listForScan(session.scanId)
    expect(rows.total).toBe(1)
    expect(rows.items[0].device).toBe('mobile')
  })
})
