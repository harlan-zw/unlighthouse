// Phase 16 — `compare.markdown` renders a PR-comment friendly summary.
//
// This test seeds two scans whose summaries + routes differ in known ways so
// the snapshot covers every section the handler emits: header / verdict,
// per-category delta table, top regressions, top improvements, and the
// footer. The fixture is intentionally small (3 routes × 1 device) but
// includes both a regression and an improvement so neither table is empty.

import type { Scan, ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { compareMarkdown } from '@unlighthouse/core/api/handlers'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { testHandlerCtx, testScanId, testUrl } from './helpers/contracts'

const BASE_ID = testScanId('scan-fixture-base000')
const CURRENT_ID = testScanId('scan-fixture-curr000')

function makeScan(
  scanId: ScanId,
  scoresByCategory: { 'performance': number, 'accessibility': number, 'best-practices': number, 'seo': number },
  scoreAverage: number,
): Scan {
  return {
    scanId,
    site: testUrl('https://example.com'),
    device: 'mobile',
    status: 'complete',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: '2025-01-01T00:05:00.000Z',
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: {
      routes: 3,
      completed: 3,
      failed: 0,
      scoreAverage,
      scoresByCategory,
      durationMs: 1234,
    },
  }
}

interface RouteSpec {
  url: string
  perf: number
  a11y: number
  bp: number
  seo: number
}

function makeRoute(scanId: ScanId, spec: RouteSpec): ScanRoute {
  return {
    url: testUrl(spec.url),
    path: new URL(spec.url).pathname,
    routeName: null,
    scorePerformance: spec.perf,
    scoreAccessibility: spec.a11y,
    scoreSeo: spec.seo,
    scoreBestPractices: spec.bp,
    lcp: null,
    cls: null,
    inp: null,
    fcp: null,
    ttfb: null,
    tbt: null,
    si: null,
    lighthouseVersion: '11.0.0',
    capturedAt: '2025-01-01T00:01:00.000Z',
    scanId,
    device: 'mobile',
    lhrBlobKey: `scans/${scanId}/lhr/abc.json.gz`,
  }
}

function makeCtx(): HandlerCtx {
  return testHandlerCtx(memoryStorage(), {
    auditors: {
      list: () => [{ name: 'mock', ok: true }],
      test: async (name: string) => ({ name, ok: true }),
    },
  })
}

describe('compare.markdown PR-comment renderer', () => {
  it('renders header, category table, top regressions/improvements, and footer', async () => {
    const ctx = makeCtx()

    // Base scan: solid scores across the board.
    await ctx.storage.scans.create(makeScan(
      BASE_ID,
      { 'performance': 0.95, 'accessibility': 0.90, 'best-practices': 0.92, 'seo': 1.0 },
      0.94,
    ))
    await ctx.storage.routes.putBatch(BASE_ID, 'mobile', [
      makeRoute(BASE_ID, { url: 'https://example.com/', perf: 0.95, a11y: 0.90, bp: 0.92, seo: 1.0 }),
      makeRoute(BASE_ID, { url: 'https://example.com/about', perf: 0.80, a11y: 0.85, bp: 0.95, seo: 1.0 }),
      makeRoute(BASE_ID, { url: 'https://example.com/contact', perf: 0.70, a11y: 0.80, bp: 0.90, seo: 0.95 }),
    ])

    // Current scan: perf regressed on `/` and `/about`, a11y improved on
    // `/contact`. Best-practices and SEO stable.
    await ctx.storage.scans.create(makeScan(
      CURRENT_ID,
      { 'performance': 0.70, 'accessibility': 0.93, 'best-practices': 0.92, 'seo': 1.0 },
      0.89,
    ))
    await ctx.storage.routes.putBatch(CURRENT_ID, 'mobile', [
      makeRoute(CURRENT_ID, { url: 'https://example.com/', perf: 0.60, a11y: 0.90, bp: 0.92, seo: 1.0 }),
      makeRoute(CURRENT_ID, { url: 'https://example.com/about', perf: 0.65, a11y: 0.85, bp: 0.95, seo: 1.0 }),
      makeRoute(CURRENT_ID, { url: 'https://example.com/contact', perf: 0.70, a11y: 0.95, bp: 0.90, seo: 0.95 }),
    ])

    const out = await compareMarkdown.run(
      { baseScanId: BASE_ID, currentScanId: CURRENT_ID },
      ctx,
    )

    expect(out.hasRegressions).toBe(true)
    expect(out.markdown).toMatchSnapshot()
  })

  it('renders a clean comparison with no regressions or improvements', async () => {
    const ctx = makeCtx()
    const stable = { 'performance': 0.90, 'accessibility': 0.90, 'best-practices': 0.90, 'seo': 0.90 }
    await ctx.storage.scans.create(makeScan(BASE_ID, stable, 0.90))
    await ctx.storage.scans.create(makeScan(CURRENT_ID, stable, 0.90))
    await ctx.storage.routes.putBatch(BASE_ID, 'mobile', [
      makeRoute(BASE_ID, { url: 'https://example.com/', perf: 0.9, a11y: 0.9, bp: 0.9, seo: 0.9 }),
    ])
    await ctx.storage.routes.putBatch(CURRENT_ID, 'mobile', [
      makeRoute(CURRENT_ID, { url: 'https://example.com/', perf: 0.9, a11y: 0.9, bp: 0.9, seo: 0.9 }),
    ])
    const out = await compareMarkdown.run(
      { baseScanId: BASE_ID, currentScanId: CURRENT_ID, title: 'PR #123' },
      ctx,
    )
    expect(out.hasRegressions).toBe(false)
    // The verdict should reflect "no change" and neither top-N table should
    // render — those headings are gated on having at least one row.
    expect(out.markdown).toContain('No significant change')
    expect(out.markdown).not.toContain('Worst regressions')
    expect(out.markdown).not.toContain('Best improvements')
    expect(out.markdown).toContain('## PR #123')
    expect(out.markdown).toContain('Generated by [Unlighthouse]')
  })
})
