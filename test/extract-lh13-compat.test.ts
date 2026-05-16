// Lighthouse 13 (2025-10) reshuffled the performance audits — several
// classic ones got removed in favour of `*-insight` equivalents. Canonical
// perf metric ids (LCP / CLS / TBT / FCP / SI / TTFB / INP) kept their
// names, so extract.ts should keep producing the same shape against a v13
// LHR. These tests pin that contract with a synthetic v13 fixture and
// guard against future LH bumps silently dropping numeric values.

import { extractRouteData, reconcileToContract } from '@unlighthouse/core/report'
import { describe, expect, it } from 'vitest'

function lh13Lhr(overrides: Record<string, unknown> = {}) {
  return {
    lighthouseVersion: '13.0.0',
    userAgent: 'lh13-test/1.0',
    categories: {
      'performance': {
        score: 0.92,
        auditRefs: [
          { id: 'largest-contentful-paint', weight: 25 },
          { id: 'cumulative-layout-shift', weight: 25 },
          { id: 'total-blocking-time', weight: 30 },
          { id: 'first-contentful-paint', weight: 10 },
          { id: 'speed-index', weight: 10 },
          // LH 13 keeps the classic timing audits but defers some to insights.
          { id: 'server-response-time', weight: 0 },
          { id: 'render-blocking-insight', weight: 0 },
          { id: 'document-latency-insight', weight: 0 },
          { id: 'lcp-breakdown-insight', weight: 0 },
        ],
      },
      'seo': {
        score: 0.95,
        // LH 13 removed font-size from the SEO category. seo-basics should
        // not see it; this fixture exercises that path.
        auditRefs: [
          { id: 'is-crawlable', weight: 4 },
          { id: 'document-title', weight: 1 },
          { id: 'meta-description', weight: 1 },
        ],
      },
    },
    audits: {
      'largest-contentful-paint': { score: 0.85, scoreDisplayMode: 'numeric', numericValue: 1450, displayValue: '1.5 s' },
      'cumulative-layout-shift': { score: 1, scoreDisplayMode: 'numeric', numericValue: 0.02, displayValue: '0.02' },
      'total-blocking-time': { score: 0.92, scoreDisplayMode: 'numeric', numericValue: 80, displayValue: '80 ms' },
      'first-contentful-paint': { score: 0.97, scoreDisplayMode: 'numeric', numericValue: 920, displayValue: '0.9 s' },
      'speed-index': { score: 0.88, scoreDisplayMode: 'numeric', numericValue: 1400, displayValue: '1.4 s' },
      // LH 13: still emitted, defers numericValue to Document Latency insight.
      'server-response-time': { score: 0.95, scoreDisplayMode: 'numeric', numericValue: 180, displayValue: '180 ms' },
      'interaction-to-next-paint': { score: 1, scoreDisplayMode: 'numeric', numericValue: 90, displayValue: '90 ms' },
      // Insight audits — LH 13 emphasises these. We don't extract numeric
      // values from them (pack-side concern), but the shape should round-
      // trip through reconcileToContract without exploding.
      'render-blocking-insight': {
        score: 0.5,
        scoreDisplayMode: 'numeric',
        displayValue: 'Potential savings of 250 ms',
        title: 'Eliminate render-blocking resources',
        metricSavings: { FCP: 250, LCP: 180 },
      },
      'document-latency-insight': {
        score: 0.85,
        scoreDisplayMode: 'numeric',
        title: 'Reduce document latency',
        metricSavings: { LCP: 150 },
      },
      'lcp-breakdown-insight': {
        score: 0.9,
        scoreDisplayMode: 'informative',
        title: 'LCP breakdown',
      },
      'is-crawlable': { score: 1, scoreDisplayMode: 'binary', title: 'Page is crawlable' },
      'document-title': { score: 1, scoreDisplayMode: 'binary', title: 'Document has a `<title>` element' },
      'meta-description': { score: 0, scoreDisplayMode: 'binary', title: 'Document does not have a meta description' },
    },
    ...overrides,
  } as never
}

describe('extract.ts against a Lighthouse 13 LHR', () => {
  it('extractRouteData reads canonical perf metrics unchanged', () => {
    const out = extractRouteData(lh13Lhr())
    expect(out.lcp).toBe(1450)
    expect(out.cls).toBe(20) // round(0.02 * 1000)
    expect(out.tbt).toBe(80)
    expect(out.fcp).toBe(920)
    expect(out.si).toBe(1400)
    expect(out.ttfb).toBe(180)
    expect(out.inp).toBe(90)
    expect(out.scores.performance).toBe(0.92)
    expect(out.scores.seo).toBe(0.95)
  })

  it('reconcileToContract round-trips a v13 LHR including insight audits', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: lh13Lhr(),
    })
    // Insight audit projected with title + metricSavings.
    expect(out.audits['render-blocking-insight'].title).toMatch(/render-blocking/)
    expect(out.audits['render-blocking-insight'].metricSavings).toEqual({ FCP: 250, LCP: 180 })
    expect(out.audits['render-blocking-insight'].severity).toBe('warn')

    // Informative insight audits derive severity = 'pass' regardless of score.
    expect(out.audits['lcp-breakdown-insight'].severity).toBe('pass')

    // SEO auditRefs reflect what LH 13 actually ships — no font-size row.
    expect(out.categories.seo?.auditRefs.map(r => r.id)).toEqual([
      'is-crawlable',
      'document-title',
      'meta-description',
    ])
    // is-crawlable weight preserved for seo-basics severity derivation.
    expect(out.categories.seo?.auditRefs[0]).toEqual({ id: 'is-crawlable', weight: 4 })

    // metricSavings collapses to null on audits that don't carry it.
    expect(out.audits['largest-contentful-paint'].metricSavings).toBeNull()
  })

  it('survives a v13 LHR where an insight audit ships without metricSavings', () => {
    const lhr = lh13Lhr({
      audits: {
        ...(lh13Lhr().audits as Record<string, unknown>),
        // An insight that didn't compute savings on this page — pack guards
        // expect metricSavings === null, not undefined.
        'image-delivery-insight': {
          score: null,
          scoreDisplayMode: 'notApplicable',
          title: 'Optimise image delivery',
        },
      },
    })
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr,
    })
    expect(out.audits['image-delivery-insight'].metricSavings).toBeNull()
    // notApplicable always derives severity = 'pass' (never blocks a scan).
    expect(out.audits['image-delivery-insight'].severity).toBe('pass')
  })
})
