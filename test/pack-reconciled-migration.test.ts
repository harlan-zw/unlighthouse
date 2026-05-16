// Verifies the cwv + seo-basics packs prefer the reconciled blob over the
// raw LHR. This is the user-visible contract of the D-030 migration: pack
// behaviour shouldn't change, but the data path does (fewer LHR fetches,
// LH-version stable).

import type { PackReconcileCtx, ReconciledReport, ScanRoute } from '@unlighthouse/contracts'
import { cwvPack } from '@unlighthouse/core/packs/cwv'
import { seoBasicsPack } from '@unlighthouse/core/packs/seo-basics'
import { describe, expect, it, vi } from 'vitest'

// ── Fixture helpers ─────────────────────────────────────────────────────────

function buildRoute(url: string): ScanRoute {
  return {
    scanId: 'scan-1' as never,
    url: url as never,
    path: new URL(url).pathname,
    routeName: null,
    status: 'completed',
    scorePerformance: 0.9,
    scoreAccessibility: 0.95,
    scoreSeo: 0.85,
    scoreBestPractices: 0.9,
    lcp: 1200,
    cls: 0.01,
    inp: 100,
    fcp: 1000,
    ttfb: 200,
    tbt: 50,
    si: 1500,
    routeMatcherId: null,
    lhrBlobKey: 'scans/scan-1/lhr/x.json',
    htmlBlobKey: null,
    auditedAt: new Date().toISOString(),
  } as never
}

function reconciledReportWith(audits: ReconciledReport['audits'], seoRefs: Array<{ id: string, weight: number }> = []): ReconciledReport {
  return {
    scanId: 'scan-1' as never,
    url: 'http://example.com/' as never,
    device: 'mobile',
    metrics: {
      scorePerformance: 0.9,
      scoreAccessibility: 0.95,
      scoreSeo: 0.85,
      scoreBestPractices: 0.9,
      lcp: 1200,
      cls: 0.01,
      inp: 100,
      fcp: 1000,
      ttfb: 200,
      tbt: 50,
      si: 1500,
    },
    categories: {
      seo: { score: 0.85, auditRefs: seoRefs },
    },
    audits,
    provenance: {
      lighthouseVersion: '12.0.0',
      userAgent: 'test-agent/1.0',
      capturedAt: new Date().toISOString(),
    },
  }
}

// ── cwv pack ────────────────────────────────────────────────────────────────

describe('cwv pack prefers reconciled report', () => {
  it('reads metricSavings from reconciled blob; never calls getLhr when reconciled exists', async () => {
    const route = buildRoute('http://example.com/')
    const reconciled = reconciledReportWith({
      'render-blocking-insight': {
        id: 'render-blocking-insight',
        score: 0.5,
        scoreDisplayMode: 'numeric',
        displayValue: '250 ms',
        title: 'Eliminate render-blocking resources',
        description: 'Resources block the first paint.',
        severity: 'warn',
        metricSavings: { FCP: 300, LCP: 200 },
      },
    })
    const getReconciled = vi.fn(async () => reconciled)
    const getLhr = vi.fn(async () => null)

    const report = await cwvPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [route],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    expect(getLhr).not.toHaveBeenCalled()
    expect(report.topFixes).toHaveLength(2) // FCP + LCP rows for the same insight
    const fcpFix = report.topFixes.find(f => f.metric === 'fcp')
    expect(fcpFix?.maxImpactMs).toBe(300)
    expect(fcpFix?.insight).toBe('render-blocking-insight')
  })

  it('falls back to getLhr when reconciled returns null (old scan)', async () => {
    const route = buildRoute('http://example.com/')
    const getReconciled = vi.fn(async () => null)
    const getLhr = vi.fn(async () => ({
      audits: {
        'render-blocking-insight': {
          metricSavings: { FCP: 150 },
        },
      },
    }))

    const report = await cwvPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [route],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    expect(getLhr).toHaveBeenCalledTimes(1)
    expect(report.topFixes).toHaveLength(1)
    expect(report.topFixes[0].metric).toBe('fcp')
    expect(report.topFixes[0].maxImpactMs).toBe(150)
  })
})

// ── seo-basics pack ─────────────────────────────────────────────────────────

describe('seo-basics pack prefers reconciled report', () => {
  it('reads title/weight/score from reconciled blob and only hits LHR for details.items', async () => {
    const route = buildRoute('http://example.com/about')
    const reconciled = reconciledReportWith(
      {
        'is-crawlable': {
          id: 'is-crawlable',
          score: 1,
          scoreDisplayMode: 'binary',
          displayValue: null,
          title: 'Page is not blocked from indexing',
          description: 'Search engines can crawl this page.',
          severity: 'pass',
          metricSavings: null,
        },
        'document-title': {
          id: 'document-title',
          score: 0,
          scoreDisplayMode: 'binary',
          displayValue: null,
          title: 'Document has a <title> element',
          description: 'The title gives screen reader users an overview of the page.',
          severity: 'fail',
          metricSavings: null,
        },
      },
      [
        { id: 'is-crawlable', weight: 4 },
        { id: 'document-title', weight: 1 },
      ],
    )
    const getReconciled = vi.fn(async () => reconciled)
    const getLhr = vi.fn(async () => ({
      audits: {
        'document-title': {
          details: { items: [{ node: { selector: 'title', snippet: '<title></title>', nodeLabel: '' } }] },
        },
      },
    }))

    const report = await seoBasicsPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [route],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    // LHR is consulted in parallel for sampleElements (intentional — packs
    // need element-level data the reconciled blob doesn't carry).
    expect(getLhr).toHaveBeenCalledTimes(1)

    // Indexability: is-crawlable passes (score 1), so route stays indexable.
    expect(report.indexableRoutes).toBe(1)
    expect(report.unindexableRoutes).toBe(0)

    // The failing audit landed in findings; severity derived from the
    // reconciled blob's weight (1 → 'serious').
    const docTitle = report.findings.find(f => f.auditId === 'document-title')
    expect(docTitle).toBeDefined()
    expect(docTitle?.severity).toBe('serious')
    expect(docTitle?.title).toBe('Document has a <title> element')
    // Element samples pulled from the raw LHR despite reconciled being primary.
    expect(docTitle?.sampleElements).toHaveLength(1)
    expect(docTitle?.sampleElements[0].selector).toBe('title')
  })

  it('still works with only LHR available (reconciled fetcher absent)', async () => {
    const route = buildRoute('http://example.com/')
    const getLhr = vi.fn(async () => ({
      categories: { seo: { auditRefs: [{ id: 'is-crawlable', weight: 4 }] } },
      audits: { 'is-crawlable': { score: 1, title: 'Crawlable', description: 'x' } },
    }))

    const report = await seoBasicsPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [route],
      getLhr,
    } as PackReconcileCtx)

    expect(getLhr).toHaveBeenCalledTimes(1)
    expect(report.routesAnalysed).toBe(1)
    expect(report.indexableRoutes).toBe(1)
  })
})
