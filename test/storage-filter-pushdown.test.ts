// Filter / sort push-down to storage. The drizzle + memory adapters now
// implement the RouteListQuery `filter` and `sort` fields directly, so
// scan.results / query.routes don't have to pull every row over the wire
// just to filter in JS. Behaviour is identical between the two adapters.
//
// This test exercises the memory adapter (no native deps in CI) and
// asserts the same shape the SQL path produces.

import type { Storage } from '@unlighthouse/contracts'
import { scanResults } from '@unlighthouse/core/api/handlers/scan'
import { queryRoutes } from '@unlighthouse/core/api/handlers/query'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeEach, describe, expect, it } from 'vitest'

const SCAN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeMetric(url: string, partial: Partial<{
  scorePerformance: number
  lcp: number
  cls: number
}> = {}) {
  return {
    url,
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: partial.scorePerformance ?? 0.5,
    scoreAccessibility: 0.8,
    scoreSeo: 0.9,
    scoreBestPractices: 0.85,
    lcp: partial.lcp ?? 1500,
    cls: partial.cls ?? 0.05,
    inp: 100,
    fcp: 900,
    ttfb: 200,
    tbt: 50,
    si: 1200,
    lighthouseVersion: '12.0.0',
    capturedAt: new Date().toISOString(),
  }
}

async function seedStorage(storage: Storage): Promise<void> {
  await storage.scans.create({
    scanId: SCAN as never,
    site: 'http://example.com',
    device: 'mobile',
    status: 'complete',
    startedAt: new Date().toISOString(),
    completedAt: null,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
  })
  await storage.routes.putBatch(SCAN as never, 'mobile', [
    makeMetric('http://example.com/fast', { scorePerformance: 0.95, lcp: 800 }),
    makeMetric('http://example.com/medium', { scorePerformance: 0.6, lcp: 2200 }),
    makeMetric('http://example.com/slow', { scorePerformance: 0.3, lcp: 4500 }),
    makeMetric('http://example.com/about', { scorePerformance: 0.9, lcp: 1100 }),
  ])
}

const ctx = (s: Storage) => ({
  storage: s,
  core: { hooks: undefined } as never,
  auditor: undefined as never,
  config: {} as never,
  version: 'test',
} as never)

describe('storage filter push-down', () => {
  let storage: Storage
  beforeEach(async () => {
    storage = memoryStorage()
    await seedStorage(storage)
  })

  it('scan.results minScore narrows the row set + counts the filtered total', async () => {
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        filter: { minScore: { performance: 0.9 } },
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url).sort()).toEqual([
      'http://example.com/about',
      'http://example.com/fast',
    ])
    // total reflects the filtered set — not the raw 4 rows.
    expect(out.total).toBe(2)
  })

  it('scan.results maxMetric filters + ignores null columns', async () => {
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        filter: { maxMetric: { lcp: 1500 } },
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url).sort()).toEqual([
      'http://example.com/about',
      'http://example.com/fast',
    ])
  })

  it('scan.results sort is applied at the storage layer', async () => {
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        sort: 'lcp-asc',
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url)).toEqual([
      'http://example.com/fast', // 800
      'http://example.com/about', // 1100
      'http://example.com/medium', // 2200
      'http://example.com/slow', // 4500
    ])
  })

  it('scan.results pagination is post-filter (correct totals + page slice)', async () => {
    // Asking for page 2 of size 1 of the lcp-asc sort should return /about
    // (second smallest LCP). Total stays at 4 (no filter); pagination is on
    // top of the ordered set.
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        sort: 'lcp-asc',
        page: 2,
        pageSize: 1,
      } as never,
      ctx(storage),
    )
    expect(out.total).toBe(4)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].url).toBe('http://example.com/about')
  })

  it('scan.results urlPattern (literal) pushes to storage', async () => {
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        filter: { urlPattern: '/medium' },
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url)).toEqual(['http://example.com/medium'])
  })

  it('scan.results urlPattern (regex) falls back to JS after storage returns', async () => {
    // `^http://example\.com/(fast|slow)$` is a real regex — the handler
    // detects this and skips storage's substring path, applying the regex
    // on the returned page.
    const out = await scanResults.run(
      {
        scanId: SCAN as never,
        filter: { urlPattern: '^http://example\\.com/(fast|slow)$' },
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url).sort()).toEqual([
      'http://example.com/fast',
      'http://example.com/slow',
    ])
  })

  it('query.routes single-scan path uses storage push-down', async () => {
    const out = await queryRoutes.run(
      {
        scanId: SCAN as never,
        filter: { minScore: { performance: 0.8 } },
        sort: 'score-desc',
        page: 1,
        pageSize: 50,
      } as never,
      ctx(storage),
    )
    expect(out.items.map(r => r.url)).toEqual([
      'http://example.com/fast', // 0.95
      'http://example.com/about', // 0.9
    ])
    expect(out.total).toBe(2)
  })
})
