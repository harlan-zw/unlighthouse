// P0-2: multi-sample median. Covers the pure selector (computeMedianRun) and
// the auditRoute sample loop that consumes `scanner.samples`.

import type { RouteAuditDeps } from '@unlighthouse/core'
import type { ExtractedMetrics, ScanId } from '@unlighthouse/contracts/types/atoms'
import { auditRoute } from '@unlighthouse/core'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { computeMedianRun } from '../packages/core/src/util/median'
import { testConfig, testScanId } from './helpers/contracts'

describe('computeMedianRun', () => {
  it('returns the single run unchanged', () => {
    expect(computeMedianRun([{ p: 0.5 }], r => r.p)).toEqual({ p: 0.5 })
  })

  it('picks the middle run for odd counts', () => {
    const runs = [{ p: 0.5 }, { p: 0.9 }, { p: 0.7 }]
    expect(computeMedianRun(runs, r => r.p)).toEqual({ p: 0.7 })
  })

  it('picks the lower-median for even counts (never optimistic)', () => {
    const runs = [{ p: 0.2 }, { p: 0.8 }, { p: 0.4 }, { p: 0.6 }]
    expect(computeMedianRun(runs, r => r.p)).toEqual({ p: 0.4 })
  })

  it('ignores runs whose score is null', () => {
    const runs = [{ p: null }, { p: 0.9 }, { p: null }]
    expect(computeMedianRun(runs, r => r.p)).toEqual({ p: 0.9 })
  })

  it('falls back to the first run when no score is numeric', () => {
    const runs = [{ p: null, tag: 'a' }, { p: null, tag: 'b' }]
    expect(computeMedianRun(runs, r => r.p)).toEqual({ p: null, tag: 'a' })
  })

  it('throws on an empty list', () => {
    expect(() => computeMedianRun([], () => 0)).toThrow()
  })
})

// ── auditRoute sample loop ───────────────────────────────────────────────────

const SCAN_ID = testScanId('sample-median-0001')
const TEST_URL = 'https://example.com/'

function makeExtracted(url: string, scorePerformance: number): ExtractedMetrics {
  return {
    url: url as ExtractedMetrics['url'],
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance,
    scoreAccessibility: null,
    scoreSeo: null,
    scoreBestPractices: null,
    lcp: null,
    cls: null,
    inp: null,
    fcp: null,
    ttfb: null,
    tbt: null,
    si: null,
    lighthouseVersion: '13.4.0',
    capturedAt: '2026-01-01T00:00:00.000Z',
  }
}

// Lightweight fake auditor: no lhrGzip, so auditRoute takes the else-branch
// (persist metrics, no blob work). Each call yields the next perf score and
// counts invocations.
function makeDeps(perfs: number[]): { deps: RouteAuditDeps, calls: () => number } {
  let i = 0
  const auditor = {
    audit: async (url: string) => {
      const perf = perfs[Math.min(i, perfs.length - 1)]!
      i += 1
      return { extracted: makeExtracted(url, perf), lighthouseVersion: '13.4.0' }
    },
  }
  const deps: RouteAuditDeps = {
    auditor,
    storage: memoryStorage(),
    config: testConfig({ site: 'https://example.com', scanner: { device: 'mobile', samples: perfs.length } }),
    emit: async () => {},
  }
  return { deps, calls: () => i }
}

describe('auditRoute multi-sample', () => {
  it('audits `samples` times and persists the median run', async () => {
    const { deps, calls } = makeDeps([0.5, 0.9, 0.7])
    const result = await auditRoute(deps, { scanId: SCAN_ID, url: TEST_URL, device: 'mobile' })

    expect(calls()).toBe(3)
    expect(result.ok).toBe(true)
    expect((result.metrics as ExtractedMetrics).scorePerformance).toBe(0.7)

    const row = await deps.storage.routes.get(SCAN_ID, TEST_URL, 'mobile')
    expect(row?.scorePerformance).toBe(0.7)
  })

  it('audits once when samples is 1 (no sampling overhead)', async () => {
    const { deps, calls } = makeDeps([0.42])
    const result = await auditRoute(deps, { scanId: SCAN_ID, url: TEST_URL, device: 'mobile' })
    expect(calls()).toBe(1)
    expect((result.metrics as ExtractedMetrics).scorePerformance).toBe(0.42)
  })
})
