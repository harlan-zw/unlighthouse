// CrUX adapter feeds the same reconcile + pack pipeline a lab Lighthouse run
// would. Pre-D-030 the adapter just packed the time-series into an opaque
// `crux-history` audit and called it a day, which meant:
//   - ingest wrote no LHR / reconciled blob (no lhrGzip)
//   - extracted columns were null → ScanRoute had no metrics
//   - getReconciled / getLhr both returned null → packs saw no rows
//
// This test pins that the adapter now produces a synthetic LHR that
// extract.ts + reconcileToContract can lift cleanly, plus a real
// `extracted` payload that ingest writes to scan_routes columns.

import { createCruxAuditor } from '@unlighthouse/core/auditors/crux'
import { reconcileToContract } from '@unlighthouse/core/report'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

// Synthetic CrUX history payload — one collection period, all three metrics.
function mockCruxResponse() {
  return {
    ok: true,
    json: async () => ({
      record: {
        key: { formFactor: 'PHONE', origin: 'https://example.com' },
        metrics: {
          largest_contentful_paint: {
            histogramTimeseries: [{ start: 0, end: 2500, densities: [0.8] }],
            percentilesTimeseries: { p75s: [2200] },
          },
          interaction_to_next_paint: {
            histogramTimeseries: [{ start: 0, end: 200, densities: [0.9] }],
            percentilesTimeseries: { p75s: [180] },
          },
          cumulative_layout_shift: {
            histogramTimeseries: [{ start: 0, end: 0.1, densities: [0.95] }],
            // CrUX serialises CLS as a stringified small float ("0.05"). The
            // adapter's `normaliseP75` multiplies by 1000 → 50 (CLS-units * 1000).
            percentilesTimeseries: { p75s: ['0.05'] },
          },
        },
        collectionPeriods: [{
          firstDate: { year: 2025, month: 4, day: 1 },
          lastDate: { year: 2025, month: 4, day: 28 },
        }],
      },
    }),
  } as Response
}

describe('CrUX audit pipeline', () => {
  it('produces a synthetic LHR with lhrGzip + extracted + reconcile-compatible shape', async () => {
    globalThis.fetch = vi.fn(async () => mockCruxResponse()) as never
    const auditor = createCruxAuditor({ apiKey: 'fake', formFactor: 'PHONE' })

    const report = await auditor.audit('https://example.com/', undefined, {}) as unknown as {
      categories: { performance: { score: number, auditRefs: Array<{ id: string, weight: number }> } }
      audits: Record<string, { score: number | null, numericValue: number }>
      lhrGzip: Uint8Array
      extracted: { lcp: number, cls: number, inp: number, scorePerformance: number }
    }

    // Synthetic categories + audits match what extract.ts reads.
    expect(report.categories.performance.score).toBeGreaterThan(0.9) // all "good" thresholds
    expect(report.audits['largest-contentful-paint'].numericValue).toBe(2200)
    expect(report.audits['interaction-to-next-paint'].numericValue).toBe(180)
    expect(report.audits['cumulative-layout-shift'].numericValue).toBeCloseTo(0.05, 3)

    // extracted populated so ingest writes real metric columns.
    expect(report.extracted.lcp).toBe(2200)
    expect(report.extracted.inp).toBe(180)
    expect(report.extracted.cls).toBeCloseTo(0.05, 3)
    expect(report.extracted.scorePerformance).toBeGreaterThan(0.9)

    // lhrGzip round-trips back to the same shape so the ingest path can
    // persist it under lhrBlobKey without re-serialising.
    const decoded = JSON.parse(gunzipSync(report.lhrGzip).toString())
    expect(decoded.audits['largest-contentful-paint'].numericValue).toBe(2200)
  })

  it('reconcileToContract round-trips the synthetic CrUX LHR', async () => {
    globalThis.fetch = vi.fn(async () => mockCruxResponse()) as never
    const auditor = createCruxAuditor({ apiKey: 'fake', formFactor: 'PHONE' })
    const report = await auditor.audit('https://example.com/', undefined, {}) as unknown as { audits: Record<string, unknown> }

    const reconciled = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'https://example.com/',
      device: 'mobile',
      lhr: report as never,
    })

    expect(reconciled.metrics.lcp).toBe(2200)
    expect(reconciled.metrics.inp).toBe(180)
    // The lab/perf packs read severity off the AuditFinding shape — verify
    // it survives reconcile.
    expect(reconciled.audits['largest-contentful-paint'].severity).toBe('pass')
    expect(reconciled.audits['interaction-to-next-paint'].severity).toBe('pass')
    expect(reconciled.audits['cumulative-layout-shift'].severity).toBe('pass')
    expect(reconciled.categories.performance?.score).toBeGreaterThan(0.9)
    // Only `performance` category populated — CrUX has no a11y/seo/best-practices.
    expect(reconciled.categories.accessibility).toBeUndefined()
    expect(reconciled.categories.seo).toBeUndefined()
  })

  it('scores degrade through the warn / fail buckets at lab thresholds', async () => {
    // The piecewise-linear score function is:
    //   value ≤ good            → 1.0
    //   good < value ≤ poor     → 0.5 (warn bucket on the pack side)
    //   poor < value ≤ 2×poor   → linear fade 0.5 → 0
    //   value > 2×poor          → 0   (fail bucket)
    //
    // LCP 3500 sits between good (2500) and poor (4000) → score 0.5.
    // INP 1100 is past 2×poor (1000) → score 0.
    // CLS 0.6 is past 2×poor (0.5) → score 0.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        record: {
          key: { formFactor: 'PHONE', origin: 'https://example.com' },
          metrics: {
            largest_contentful_paint: { histogramTimeseries: [], percentilesTimeseries: { p75s: [3500] } },
            interaction_to_next_paint: { histogramTimeseries: [], percentilesTimeseries: { p75s: [1100] } },
            cumulative_layout_shift: { histogramTimeseries: [], percentilesTimeseries: { p75s: ['0.6'] } },
          },
          collectionPeriods: [{ firstDate: { year: 2025, month: 4, day: 1 }, lastDate: { year: 2025, month: 4, day: 28 } }],
        },
      }),
    }) as Response) as never
    const auditor = createCruxAuditor({ apiKey: 'fake' })
    const report = await auditor.audit('https://example.com/', undefined, {}) as unknown as { audits: Record<string, { score: number | null }> }

    expect(report.audits['largest-contentful-paint'].score).toBe(0.5)
    expect(report.audits['interaction-to-next-paint'].score).toBe(0)
    expect(report.audits['cumulative-layout-shift'].score).toBe(0)
  })

  it('survives a CrUX response with no metric data (empty series)', async () => {
    // Real-world: brand-new sites have no CrUX history yet. The adapter
    // should still return a valid LHR so the scan completes; metrics just
    // come through as null.
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        record: {
          key: { formFactor: 'PHONE', origin: 'https://unknown.example' },
          metrics: {},
          collectionPeriods: [],
        },
      }),
    }) as Response) as never
    const auditor = createCruxAuditor({ apiKey: 'fake' })
    const report = await auditor.audit('https://unknown.example/', undefined, {}) as unknown as {
      categories: { performance: { score: number | null, auditRefs: unknown[] } }
      extracted: { lcp: number | null, scorePerformance: number | null }
    }

    expect(report.categories.performance.score).toBeNull()
    expect(report.categories.performance.auditRefs).toEqual([])
    expect(report.extracted.lcp).toBeNull()
    expect(report.extracted.scorePerformance).toBeNull()
  })
})
