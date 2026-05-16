// D-029: query.routes is the cross-scan query surface. Two bugs surfaced
// after the matrix-scan runtime landed:
//
//   1. The scanId-scoped branch ignored input.device and returned every
//      (url, device) row in a matrix scan even when the caller asked for
//      just one form-factor.
//   2. The projection branch dropped the device field. Matrix rows then
//      lost the only thing distinguishing them on the wire — two rows
//      with the same URL but different device, indistinguishable.

import type { Storage } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { queryRoutes } from '@unlighthouse/core/api/handlers/query'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeAll, describe, expect, it } from 'vitest'

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

const makeCtx = (storage: Storage) => ({
  storage,
  core: { hooks: undefined } as never,
  auditor: createMockAuditor(),
} as never)

describe('query.routes honours input.device', () => {
  let storage: Storage
  let scanId: string

  beforeAll(async () => {
    storage = memoryStorage()
    scanId = await runMatrixScan(storage)
  })

  it('scanId-scoped: no device → both rows', async () => {
    const out = await queryRoutes.run(
      { scanId: scanId as never, page: 1, pageSize: 50 } as never,
      makeCtx(storage),
    )
    expect(out.total).toBe(2)
    expect(out.items.map(r => r.device).sort()).toEqual(['desktop', 'mobile'])
  })

  it('scanId-scoped: device filter narrows to one row', async () => {
    const out = await queryRoutes.run(
      { scanId: scanId as never, device: 'desktop', page: 1, pageSize: 50 } as never,
      makeCtx(storage),
    )
    expect(out.total).toBe(1)
    expect(out.items[0].device).toBe('desktop')
    expect(out.items[0].scorePerformance).toBe(0.98)
  })

  it('projection preserves the device field so matrix rows stay distinguishable', async () => {
    const out = await queryRoutes.run(
      {
        scanId: scanId as never,
        projection: ['lcp'],
        page: 1,
        pageSize: 50,
      } as never,
      makeCtx(storage),
    )
    expect(out.items).toHaveLength(2)
    // Both rows carry device; projection didn't strip it.
    for (const r of out.items)
      expect(r.device).toMatch(/^(mobile|desktop)$/)
    // Same URL but different device — the only thing distinguishing them
    // is the device field, so dropping it would have collapsed the wire.
    expect(out.items[0].url).toBe(out.items[1].url)
    expect(out.items[0].device).not.toBe(out.items[1].device)
  })
})
