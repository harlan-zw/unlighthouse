// Regression test for the multi-device double-count / desktop-drop bug: the
// pack reconcilers used to loop `ctx.routes` (one row per (url, device)) and
// call `getReconciled(url, 'mobile')` / `getLhr(url, 'mobile')` with a
// hardcoded device, ignoring `row.device`. On a `--device mobile,desktop`
// scan this (a) processed every URL twice, inflating `routesAnalysed` ~2x,
// and (b) fed desktop-only routes through a mobile-keyed fetcher, so they
// silently returned no data instead of being analysed on their own device.
//
// The fix: `resolveDistinctPackRoutes` (packs/reconcile-context.ts) folds
// `ctx.routes` down to one row per distinct URL, preferring the 'mobile' row
// when present and otherwise falling back to whichever device the URL
// actually has data for. This file proves the helper directly, then proves
// two of the five affected packs (best-practices, seo-basics) consume it
// correctly end to end.

import type { ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { bestPracticesPack, cwvPack, resolveDistinctPackRoutes, seoBasicsPack } from '@unlighthouse/core/packs'
import { describe, expect, it } from 'vitest'

// ── Fixture routes ───────────────────────────────────────────────────────────
//
// Scan shape under test: URL A has both a mobile row and a desktop row
// (a `--device mobile,desktop` scan); URL B only has a desktop row (a route
// that, for whatever reason, only completed on one device).

const URL_A = 'http://example.com/'
const URL_B = 'http://example.com/desktop-only'

function makeRoute(url: string, device: 'mobile' | 'desktop'): ScanRoute {
  return {
    scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    url,
    path: new URL(url).pathname,
    routeName: null,
    device,
    scorePerformance: 0.9,
    scoreAccessibility: 1,
    scoreSeo: 1,
    scoreBestPractices: 0.7,
    scoreAgenticBrowsing: null,
    lcp: 1200,
    cls: 0.02,
    inp: null,
    fcp: 900,
    ttfb: 100,
    tbt: 50,
    si: 1100,
    lighthouseVersion: '13.4.0',
    capturedAt: '2026-01-01T00:00:00.000Z',
    lhrBlobKey: `lhr-${url}-${device}`,
    reportBlobKey: `report-${url}-${device}`,
    screenshotBlobKey: null,
  } as unknown as ScanRoute
}

const routeAMobile = makeRoute(URL_A, 'mobile')
const routeADesktop = makeRoute(URL_A, 'desktop')
const routeBDesktop = makeRoute(URL_B, 'desktop')

const dualDeviceRoutes = [routeAMobile, routeADesktop, routeBDesktop]

// ── resolveDistinctPackRoutes (direct) ───────────────────────────────────────

describe('resolveDistinctPackRoutes', () => {
  it('dedupes to one entry per distinct URL, preferring mobile when both devices exist, falling back otherwise', () => {
    const resolved = resolveDistinctPackRoutes(dualDeviceRoutes)

    expect(resolved).toHaveLength(2)

    const a = resolved.find(r => r.url === URL_A)
    expect(a).toEqual({ url: URL_A, device: 'mobile' })

    const b = resolved.find(r => r.url === URL_B)
    expect(b).toEqual({ url: URL_B, device: 'desktop' })
  })

  it('is a no-op shape for a mobile-only scan (single device per URL)', () => {
    const resolved = resolveDistinctPackRoutes([routeAMobile, routeBDesktop])
    expect(resolved).toEqual([
      { url: URL_A, device: 'mobile' },
      { url: URL_B, device: 'desktop' },
    ])
  })
})

// ── best-practices pack ──────────────────────────────────────────────────────

function reconciledBestPractices(overrides: Partial<ReconciledReport> = {}): ReconciledReport {
  return {
    scanId: routeAMobile.scanId,
    url: URL_A,
    device: 'mobile',
    metrics: {
      scorePerformance: 0.9,
      scoreAccessibility: 1,
      scoreSeo: 1,
      scoreBestPractices: 0.7,
      scoreAgenticBrowsing: null,
      lcp: 1200,
      cls: 0.02,
      inp: null,
      fcp: 900,
      ttfb: 100,
      tbt: 50,
      si: 1100,
    },
    categories: {
      'best-practices': {
        score: 0.7,
        categoryScoreDisplayMode: 'fraction',
        auditRefs: [{ id: 'is-on-https', weight: 1 }],
      },
    },
    audits: {
      'is-on-https': {
        id: 'is-on-https',
        score: 1,
        scoreDisplayMode: 'binary',
        numericValue: null,
        displayValue: null,
        title: 'Uses HTTPS',
        description: null,
        severity: 'pass',
        metricSavings: null,
        items: null,
      },
    },
    provenance: {
      lighthouseVersion: '13.4.0',
      userAgent: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
      benchmarkIndex: null,
      timingTotal: null,
      warnings: [],
      runtimeError: null,
    },
    stackPacks: null,
    entities: null,
    ...overrides,
  } as ReconciledReport
}

// Builds a per-(url, device) reconciled report carrying a single failing
// audit whose id encodes which device produced it — lets assertions prove
// which device's data actually landed in the findings.
function deviceTaggedReport(url: string, device: 'mobile' | 'desktop'): ReconciledReport {
  const auditId = `${device}-only-finding`
  return reconciledBestPractices({
    url,
    device,
    categories: {
      'best-practices': {
        score: 0,
        categoryScoreDisplayMode: 'fraction',
        auditRefs: [{ id: auditId, weight: 1 }],
      },
    },
    audits: {
      [auditId]: {
        id: auditId,
        score: 0,
        scoreDisplayMode: 'binary',
        numericValue: null,
        displayValue: null,
        title: `${device} finding`,
        description: null,
        severity: 'fail',
        metricSavings: null,
        items: null,
      },
    },
  })
}

describe('bestPracticesPack — multi-device scan', () => {
  it('counts routesAnalysed once per distinct URL, includes the desktop-only URL, and prefers mobile when both devices exist', async () => {
    const byKey = new Map<string, ReconciledReport>([
      [`${URL_A}|mobile`, deviceTaggedReport(URL_A, 'mobile')],
      [`${URL_A}|desktop`, deviceTaggedReport(URL_A, 'desktop')],
      [`${URL_B}|desktop`, deviceTaggedReport(URL_B, 'desktop')],
    ])

    const report = await bestPracticesPack.reconciler({
      scanId: routeAMobile.scanId,
      routes: dualDeviceRoutes,
      getReconciled: async (url, device) => byKey.get(`${url}|${device}`) ?? null,
      getLhr: async () => null,
    })

    // 3 rows in ctx.routes, but only 2 distinct URLs.
    expect(report.routesAnalysed).toBe(2)

    // URL A has both devices — mobile is preferred, so only the mobile
    // finding shows up, not the desktop one.
    expect(report.findings.find(f => f.auditId === 'mobile-only-finding')).toBeDefined()
    expect(report.findings.find(f => f.auditId === 'desktop-only-finding')).toBeDefined()

    // The desktop-only finding must have come from URL B (the desktop-only
    // route), not URL A (whose desktop row is shadowed by its mobile row).
    const desktopFinding = report.findings.find(f => f.auditId === 'desktop-only-finding')
    expect(desktopFinding?.routes).toEqual([URL_B])
    expect(desktopFinding?.routeCount).toBe(1)

    const mobileFinding = report.findings.find(f => f.auditId === 'mobile-only-finding')
    expect(mobileFinding?.routes).toEqual([URL_A])
    expect(mobileFinding?.routeCount).toBe(1)
  })
})

// ── seo-basics pack ──────────────────────────────────────────────────────────

function reconciledSeo(url: string, device: 'mobile' | 'desktop', overrides: Partial<ReconciledReport> = {}): ReconciledReport {
  return {
    scanId: routeAMobile.scanId,
    url,
    device,
    metrics: {
      scorePerformance: 0.9,
      scoreAccessibility: 1,
      scoreSeo: 1,
      scoreBestPractices: 0.7,
      scoreAgenticBrowsing: null,
      lcp: 1200,
      cls: 0.02,
      inp: null,
      fcp: 900,
      ttfb: 100,
      tbt: 50,
      si: 1100,
    },
    categories: {
      seo: {
        score: 1,
        categoryScoreDisplayMode: 'fraction',
        auditRefs: [{ id: 'is-crawlable', weight: 4 }],
      },
    },
    audits: {
      'is-crawlable': {
        id: 'is-crawlable',
        score: 1,
        scoreDisplayMode: 'binary',
        numericValue: null,
        displayValue: null,
        title: 'Page is not blocked from indexing',
        description: null,
        severity: 'pass',
        metricSavings: null,
        items: null,
      },
    },
    provenance: {
      lighthouseVersion: '13.4.0',
      userAgent: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
      benchmarkIndex: null,
      timingTotal: null,
      warnings: [],
      runtimeError: null,
    },
    stackPacks: null,
    entities: null,
    ...overrides,
  } as ReconciledReport
}

describe('seoBasicsPack — multi-device scan', () => {
  it('counts routesAnalysed/indexabilityPercent over distinct URLs, not device rows', async () => {
    // URL A: indexable on both devices. URL B: only exists on desktop, and
    // is NOT indexable there (fails is-crawlable) — proves the desktop-only
    // route is read on its own device instead of being dropped or scored
    // against an absent mobile fetch.
    const byKey = new Map<string, ReconciledReport>([
      [`${URL_A}|mobile`, reconciledSeo(URL_A, 'mobile')],
      [`${URL_A}|desktop`, reconciledSeo(URL_A, 'desktop')],
      [`${URL_B}|desktop`, reconciledSeo(URL_B, 'desktop', {
        categories: {
          seo: {
            score: 0,
            categoryScoreDisplayMode: 'fraction',
            auditRefs: [{ id: 'is-crawlable', weight: 4 }],
          },
        },
        audits: {
          'is-crawlable': {
            id: 'is-crawlable',
            score: 0,
            scoreDisplayMode: 'binary',
            numericValue: null,
            displayValue: null,
            title: 'Page is blocked from indexing',
            description: null,
            severity: 'fail',
            metricSavings: null,
            items: null,
          },
        },
      })],
    ])

    const report = await seoBasicsPack.reconciler({
      scanId: routeAMobile.scanId,
      routes: dualDeviceRoutes,
      getReconciled: async (url, device) => byKey.get(`${url}|${device}`) ?? null,
      getLhr: async () => null,
    })

    // Two distinct URLs, not three rows.
    expect(report.routesAnalysed).toBe(2)
    // URL A indexable, URL B not → 1 of 2 → 50%.
    expect(report.indexableRoutes).toBe(1)
    expect(report.unindexableRoutes).toBe(1)
    expect(report.indexabilityPercent).toBe(50)

    const routeCheckB = report.routeChecks.find(rc => rc.url === URL_B)
    expect(routeCheckB).toBeDefined()
    expect(routeCheckB?.indexable).toBe(false)
  })
})

// ── cwv pack ─────────────────────────────────────────────────────────────────

describe('cwvPack — multi-device scan', () => {
  it('analyses distinct URLs once, not one per device row', async () => {
    const report = await cwvPack.reconciler({
      scanId: routeAMobile.scanId,
      routes: dualDeviceRoutes,
      getReconciled: async () => null,
      getLhr: async () => null,
    })
    // URL A (mobile+desktop) + URL B (desktop-only) → 2 distinct URLs, not 3 rows.
    expect(report.routesAnalysed).toBe(2)
  })
})
