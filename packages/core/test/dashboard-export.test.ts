import type { ExtractedMetrics } from '@unlighthouse/contracts/types/atoms'
import { gzipSync } from 'node:zlib'
import { createDashboardApi } from '@unlighthouse/core/api/dashboard'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createApp, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { testScanId, testUrl } from '../../../test/helpers/contracts'

const SCAN_ID = testScanId('dashboard-export')

function metric(index: number): ExtractedMetrics {
  const url = testUrl(`https://example.com/page/${index}`)
  return {
    url,
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: 0.9,
    scoreAccessibility: 0.9,
    scoreSeo: 0.9,
    scoreBestPractices: 0.9,
    lcp: 1_000,
    cls: 0.01,
    inp: 100,
    fcp: 800,
    ttfb: 100,
    tbt: 50,
    si: 1_200,
    lighthouseVersion: 'test',
    capturedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('dashboard export', () => {
  it('streams paged JSON and bounds contract hydration concurrency', async () => {
    const storage = memoryStorage()
    await storage.scans.create({
      scanId: SCAN_ID,
      site: testUrl('https://example.com'),
      mode: 'site',
      device: 'mobile',
      status: 'complete',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
      ciBranch: null,
      ciCommit: null,
      ciCommitMessage: null,
      summary: null,
    })
    await storage.routes.putBatch(SCAN_ID, 'mobile', Array.from({ length: 125 }, (_, index) => metric(index)))

    const pageSizes: number[] = []
    const listForScan = storage.routes.listForScan.bind(storage.routes)
    storage.routes.listForScan = async (scanId, query) => {
      pageSizes.push(query?.pageSize ?? 0)
      return listForScan(scanId, query)
    }
    let activeReads = 0
    let maxActiveReads = 0
    const get = storage.blobs.get.bind(storage.blobs)
    storage.blobs.get = async (key) => {
      activeReads++
      maxActiveReads = Math.max(maxActiveReads, activeReads)
      await new Promise(resolve => setTimeout(resolve, 1))
      const value = await get(key)
      activeReads--
      return value
    }

    const app = createApp()
    app.use(createDashboardApi(storage).handler)
    const response = await toWebHandler(app)(new Request(`http://localhost/export/${SCAN_ID}`))
    expect(response.body).not.toBeNull()
    const payload = await response.json() as { routes: unknown[] }

    expect(payload.routes).toHaveLength(125)
    expect(pageSizes).toEqual([50, 50, 50])
    expect(maxActiveReads).toBeLessThanOrEqual(8)
    expect(maxActiveReads).toBeGreaterThan(1)

    const route = await storage.routes.get(SCAN_ID, testUrl('https://example.com/page/0'), 'mobile')
    const lhr = { lighthouseVersion: 'test', requestedUrl: route?.url }
    await storage.blobs.put(route!.lhrBlobKey, new Uint8Array(gzipSync(JSON.stringify(lhr))))
    const lhrResponse = await toWebHandler(app)(new Request(`http://localhost/lhr/${SCAN_ID}/${encodeURIComponent('/page/0')}`))
    expect(lhrResponse.headers.get('content-type')).toContain('application/json')
    expect(await lhrResponse.json()).toEqual(lhr)
  })
})
