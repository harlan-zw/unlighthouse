// Reconciled blob now projects details.items for an allowlist of audits.
// These tests pin three things:
//   1. Off-list audits keep items: null (no accidental balloon).
//   2. On-list audits project items, capped at DETAIL_ITEM_CAP = 30.
//   3. The a11y + images packs read from reconciled instead of opening LHR
//      when both fetchers are available; they fall back to LHR when only
//      that's present.

import type { PackReconcileCtx, ReconciledReport, ScanRoute } from '@unlighthouse/contracts'
import { a11yQuickWinsPack } from '@unlighthouse/core/packs/a11y-quick-wins'
import { imagesPack } from '@unlighthouse/core/packs/images'
import { reconcileToContract } from '@unlighthouse/core/report'
import { describe, expect, it, vi } from 'vitest'

// ── ReconciledReport projection ────────────────────────────────────────────

function lhrWithItems() {
  return {
    lighthouseVersion: '12.0.0',
    userAgent: 'test/1.0',
    categories: {
      accessibility: { score: 0.8, auditRefs: [{ id: 'image-alt', weight: 10 }] },
    },
    audits: {
      // On-list audit — should get its items projected.
      'image-alt': {
        score: 0,
        scoreDisplayMode: 'binary',
        title: 'Image elements have `[alt]` attributes',
        description: 'Informative elements should aim for short, descriptive alt text.',
        details: {
          items: Array.from({ length: 50 }, (_, i) => ({
            node: { selector: `img.broken-${i}`, snippet: `<img src="${i}.jpg">`, nodeLabel: '' },
            url: `https://cdn.example.com/${i}.jpg`,
          })),
        },
      },
      // Off-list audit (insight audit not in the allowlist) — items stay null.
      'render-blocking-insight': {
        score: 0.5,
        scoreDisplayMode: 'numeric',
        title: 'Render-blocking',
        details: { items: [{ url: 'https://example.com/blocker.js' }] },
      },
    },
  } as never
}

describe('reconciled report details.items projection', () => {
  it('projects details for allowlisted audits, capped at 30', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: lhrWithItems(),
    })
    expect(out.audits['image-alt'].items).not.toBeNull()
    expect(out.audits['image-alt'].items).toHaveLength(30)
    expect(out.audits['image-alt'].items![0].node?.selector).toBe('img.broken-0')
    expect(out.audits['image-alt'].items![0].url).toBe('https://cdn.example.com/0.jpg')
  })

  it('off-list audits keep items: null even when LHR carries data', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: lhrWithItems(),
    })
    expect(out.audits['render-blocking-insight'].items).toBeNull()
  })

  it('audits without any details.items keep items: null', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: {
        ...lhrWithItems(),
        audits: {
          ...(lhrWithItems() as { audits: Record<string, unknown> }).audits,
          'image-alt': {
            score: 1,
            scoreDisplayMode: 'binary',
            title: 'Image elements have alt',
            // No details → no items.
          },
        },
      } as never,
    })
    expect(out.audits['image-alt'].items).toBeNull()
  })

  it('projects subItems[0].reason as the item-level reason field', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: {
        ...lhrWithItems(),
        categories: {
          ...((lhrWithItems() as { categories: Record<string, unknown> }).categories),
          performance: { score: 0.9, auditRefs: [{ id: 'image-delivery-insight', weight: 0 }] },
        },
        audits: {
          ...((lhrWithItems() as { audits: Record<string, unknown> }).audits),
          'image-delivery-insight': {
            score: 0.5,
            scoreDisplayMode: 'numeric',
            title: 'Optimise image delivery',
            details: {
              items: [{
                url: 'https://example.com/hero.jpg',
                wastedBytes: 50000,
                totalBytes: 200000,
                subItems: { items: [{ reason: 'Use modern image format (WebP).' }] },
              }],
            },
          },
        },
      } as never,
    })
    const item = out.audits['image-delivery-insight'].items?.[0]
    expect(item?.url).toBe('https://example.com/hero.jpg')
    expect(item?.wastedBytes).toBe(50000)
    expect(item?.reason).toBe('Use modern image format (WebP).')
  })
})

// ── Pack migration: getReconciled preferred over getLhr ────────────────────

function buildRoute(url: string): ScanRoute {
  return {
    scanId: 'scan-1' as never,
    url: url as never,
    device: 'mobile',
    path: new URL(url).pathname,
    routeName: null,
    status: 'completed',
    scorePerformance: 0.9,
    scoreAccessibility: 0.5,
    scoreSeo: 1,
    scoreBestPractices: 1,
    lcp: 1200,
    cls: 0.01,
    inp: 100,
    fcp: 1000,
    ttfb: 200,
    tbt: 50,
    si: 1500,
    routeMatcherId: null,
    lhrBlobKey: 'scans/scan-1/lhr/x.json.gz',
    htmlBlobKey: null,
    auditedAt: new Date().toISOString(),
  } as never
}

function reconciledForA11y(): ReconciledReport {
  return {
    scanId: 'scan-1' as never,
    url: 'http://example.com/' as never,
    device: 'mobile',
    metrics: {
      scorePerformance: 0.9, scoreAccessibility: 0.5, scoreSeo: 1, scoreBestPractices: 1,
      lcp: 1200, cls: 0.01, inp: 100, fcp: 1000, ttfb: 200, tbt: 50, si: 1500,
    },
    categories: {
      accessibility: { score: 0.5, auditRefs: [{ id: 'color-contrast', weight: 7 }] },
    },
    audits: {
      'color-contrast': {
        id: 'color-contrast',
        score: 0,
        scoreDisplayMode: 'binary',
        displayValue: null,
        title: 'Background and foreground colors do not have a sufficient contrast ratio.',
        description: 'Low-contrast text is hard to read.',
        severity: 'fail',
        metricSavings: null,
        items: [
          { url: null, type: null, totalBytes: null, wastedBytes: null, node: { selector: 'a.dim', snippet: '<a>click</a>', nodeLabel: 'click' }, snippet: null, reason: null },
        ],
      },
    },
    provenance: { lighthouseVersion: '12.0.0', userAgent: null, capturedAt: new Date().toISOString() },
  }
}

describe('a11y-quick-wins reads from reconciled when available', () => {
  it('uses getReconciled and skips getLhr', async () => {
    const getReconciled = vi.fn(async () => reconciledForA11y())
    const getLhr = vi.fn(async () => null)

    const report = await a11yQuickWinsPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [buildRoute('http://example.com/')],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    expect(getLhr).not.toHaveBeenCalled()

    const cc = report.findings.find(f => f.auditId === 'color-contrast')
    expect(cc).toBeDefined()
    expect(cc!.topElements[0].selector).toBe('a.dim')
    expect(cc!.routeCount).toBe(1)
  })

  it('falls back to getLhr when reconciled returns null', async () => {
    const getReconciled = vi.fn(async () => null)
    const getLhr = vi.fn(async () => ({
      categories: { accessibility: { auditRefs: [{ id: 'color-contrast', weight: 7 }] } },
      audits: {
        'color-contrast': {
          score: 0,
          title: 'Contrast',
          details: { items: [{ node: { selector: 'a.dim', snippet: '<a>x</a>', nodeLabel: 'x' } }] },
        },
      },
    }))

    const report = await a11yQuickWinsPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [buildRoute('http://example.com/')],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    expect(getLhr).toHaveBeenCalledTimes(1)
    expect(report.findings).toHaveLength(1)
  })
})

describe('images pack reads from reconciled when available', () => {
  it('uses getReconciled and skips getLhr', async () => {
    const reconciled: ReconciledReport = {
      scanId: 'scan-1' as never,
      url: 'http://example.com/' as never,
      device: 'mobile',
      metrics: {
        scorePerformance: 0.9, scoreAccessibility: 1, scoreSeo: 1, scoreBestPractices: 1,
        lcp: 1200, cls: 0.01, inp: 100, fcp: 1000, ttfb: 200, tbt: 50, si: 1500,
      },
      categories: {},
      audits: {
        'image-delivery-insight': {
          id: 'image-delivery-insight',
          score: 0.5,
          scoreDisplayMode: 'numeric',
          displayValue: '50 KB',
          title: 'Optimise image delivery',
          description: null,
          severity: 'warn',
          metricSavings: { LCP: 150 },
          items: [
            { url: 'https://cdn.example.com/hero.jpg', type: null, totalBytes: 200000, wastedBytes: 50000, node: null, snippet: null, reason: 'Convert to WebP' },
          ],
        },
      },
      provenance: { lighthouseVersion: '12.0.0', userAgent: null, capturedAt: new Date().toISOString() },
    }
    const getReconciled = vi.fn(async () => reconciled)
    const getLhr = vi.fn(async () => null)

    const report = await imagesPack.reconciler({
      scanId: 'scan-1' as never,
      routes: [buildRoute('http://example.com/')],
      getReconciled,
      getLhr,
    } as PackReconcileCtx)

    expect(getReconciled).toHaveBeenCalledTimes(1)
    expect(getLhr).not.toHaveBeenCalled()

    const unopt = report.findings.find(f => f.kind === 'unoptimized')
    expect(unopt).toBeDefined()
    expect(unopt!.wastedBytes).toBe(50000)
    expect(unopt!.reason).toBe('Convert to WebP')
  })
})
