// Phase 11 / issue #349 — crux pack unit tests.
//
// Covers:
//   - URL-level CrUX hit
//   - URL miss → origin fallback (records `hasOriginFallback`)
//   - Complete miss (both endpoints 404) → severity 'unknown'
//   - Severity bucketing against Google's p75 thresholds:
//       LCP: good ≤2500, ni ≤4000, poor >4000
//       CLS: good ≤0.1,  ni ≤0.25, poor >0.25
//       INP: good ≤200,  ni ≤500,  poor >500
//   - No API key → stub report (all findings source='none')
//
// All HTTP traffic stubbed with vi.spyOn(globalThis, 'fetch') — never hits the
// real CrUX API.

import type { Device, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { CruxFinding } from '@unlighthouse/core/packs'
import { analyzeLabVsField, createCruxPack, cruxPack, queryCrux } from '@unlighthouse/core/packs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_ENV_KEY = process.env.CRUX_API_KEY

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  if (ORIGINAL_ENV_KEY === undefined)
    delete process.env.CRUX_API_KEY
  else
    process.env.CRUX_API_KEY = ORIGINAL_ENV_KEY
  vi.restoreAllMocks()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  })
}

interface BuildRouteOverrides {
  device?: Device
  lcp?: number | null
  cls?: number | null
  inp?: number | null
}

function buildRoute(url: string, overrides: BuildRouteOverrides = {}): ScanRoute {
  return {
    scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    url,
    device: overrides.device ?? 'mobile',
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: 0.9,
    scoreAccessibility: 0.95,
    scoreSeo: 0.85,
    scoreBestPractices: 0.9,
    lcp: overrides.lcp === undefined ? 1200 : overrides.lcp,
    cls: overrides.cls === undefined ? 0.01 : overrides.cls,
    inp: overrides.inp === undefined ? 100 : overrides.inp,
    fcp: 1000,
    ttfb: 200,
    tbt: 50,
    si: 1500,
    lighthouseVersion: '12.0.0',
    capturedAt: new Date().toISOString(),
    lhrBlobKey: 'scans/x/lhr/x.json',
    reportBlobKey: null,
  } as ScanRoute
}

function ctxFor(routes: ScanRoute[]): PackReconcileCtx {
  return {
    scanId: routes[0]?.scanId ?? ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' as never),
    routes,
  }
}

interface CruxMetrics {
  lcp?: number
  cls?: number
  inp?: number
}

function cruxRecord(metrics: CruxMetrics, key: { url?: string, origin?: string }) {
  return {
    record: {
      key: { formFactor: 'PHONE' as const, ...key },
      metrics: {
        ...(metrics.lcp != null && {
          largest_contentful_paint: { percentiles: { p75: metrics.lcp } },
        }),
        ...(metrics.cls != null && {
          // CrUX serialises CLS as a stringified float — the client parses it.
          cumulative_layout_shift: { percentiles: { p75: String(metrics.cls) } },
        }),
        ...(metrics.inp != null && {
          interaction_to_next_paint: { percentiles: { p75: metrics.inp } },
        }),
      },
    },
  }
}

// ── queryCrux client ────────────────────────────────────────────────────────

describe('queryCrux', () => {
  it('returns source=url when the per-URL record matches', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(cruxRecord({ lcp: 1800, cls: 0.05, inp: 150 }, { url: 'https://example.com/' })),
    ) as never

    const result = await queryCrux('https://example.com/', 'PHONE', 'fake-key')
    expect(result).toEqual({ source: 'url', lcp_p75: 1800, cls_p75: 0.05, inp_p75: 150 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to origin when URL request 404s', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async (_url, init?: { body?: string }) => {
      call++
      const body = JSON.parse(init?.body as string) as { url?: string, origin?: string }
      if (call === 1) {
        expect(body.url).toBe('https://example.com/missing')
        return new Response(JSON.stringify({ error: { code: 404, message: 'not found' } }), { status: 404 })
      }
      expect(body.origin).toBe('https://example.com')
      expect(body.url).toBeUndefined()
      return jsonResponse(cruxRecord({ lcp: 2200, cls: 0.08, inp: 180 }, { origin: 'https://example.com' }))
    }) as never

    const result = await queryCrux('https://example.com/missing', 'PHONE', 'fake-key')
    expect(result).toEqual({ source: 'origin', lcp_p75: 2200, cls_p75: 0.08, inp_p75: 180 })
    expect(call).toBe(2)
  })

  it('returns source=none when both URL and origin miss', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 404 } }), { status: 404 }),
    ) as never

    const result = await queryCrux('https://unknown.example/', 'PHONE', 'fake-key')
    expect(result).toEqual({ source: 'none', lcp_p75: null, cls_p75: null, inp_p75: null })
  })

  it('treats a 400 (origin not in dataset) as a soft miss, not a throw', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 400, message: 'chrome ux report data not found' } }), { status: 400 }),
    ) as never

    const result = await queryCrux('https://obscure.example/', 'PHONE', 'fake-key')
    expect(result.source).toBe('none')
  })

  it('throws on unexpected non-2xx (e.g. 401 auth error)', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('{"error":"unauthorized"}', { status: 401 }),
    ) as never

    await expect(queryCrux('https://example.com/', 'PHONE', 'bad-key')).rejects.toThrow(/401/)
  })
})

// ── cruxPack reconciler ─────────────────────────────────────────────────────

describe('cruxPack reconciler', () => {
  beforeEach(() => {
    delete process.env.CRUX_API_KEY
  })

  it('emits stub findings (source=none) when no API key is configured', async () => {
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy as never
    const routes = [buildRoute('https://example.com/')]
    const report = await cruxPack.reconciler(ctxFor(routes))

    expect(report.routesAnalysed).toBe(1)
    expect(report.totalRoutesQueried).toBe(0)
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0]).toMatchObject({ source: 'none', severity: 'unknown' })
    expect(report.severityCounts.unknown).toBe(1)
    // Never reached out to the network.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not read CRUX_API_KEY from the ambient environment', async () => {
    process.env.CRUX_API_KEY = 'env-key'
    const fetchSpy = vi.fn(async () =>
      jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 120 }, { url: 'https://example.com/' })),
    )
    globalThis.fetch = fetchSpy as never

    const report = await cruxPack.reconciler(ctxFor([buildRoute('https://example.com/')]))
    expect(report.totalRoutesQueried).toBe(0)
    expect(report.findings[0]?.source).toBe('none')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses a key supplied explicitly at pack creation', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 120 }, { url: 'https://example.com/' })),
    ) as never

    const pack = createCruxPack({ apiKey: 'host-key' })
    const report = await pack.reconciler(ctxFor([buildRoute('https://example.com/')]))
    expect(report.totalRoutesQueried).toBe(1)
    expect(report.findings[0]?.source).toBe('url')
  })

  it('assigns severity from Google p75 thresholds — good / needsImprovement / poor', async () => {
    // Three routes, each landing in a different bucket so we can pin the
    // boundary behaviour in one go.
    const fetchSpy = vi.fn(async (_url, init?: { body?: string }) => {
      const body = JSON.parse(init?.body as string) as { url?: string }
      // "/good" — all metrics under the good ceiling.
      if (body.url === 'https://example.com/good')
        return jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 150 }, { url: body.url }))
      // "/ni" — at least one metric in the needs-improvement band, none poor.
      if (body.url === 'https://example.com/ni')
        return jsonResponse(cruxRecord({ lcp: 3200, cls: 0.05, inp: 150 }, { url: body.url }))
      // "/poor" — at least one metric past the poor threshold.
      if (body.url === 'https://example.com/poor')
        return jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 800 }, { url: body.url }))
      return new Response('{}', { status: 404 })
    })
    globalThis.fetch = fetchSpy as never

    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler(ctxFor([
      buildRoute('https://example.com/good'),
      buildRoute('https://example.com/ni'),
      buildRoute('https://example.com/poor'),
    ]))

    const byUrl = Object.fromEntries(report.findings.map(f => [f.url, f]))
    expect(byUrl['https://example.com/good']?.severity).toBe('good')
    expect(byUrl['https://example.com/ni']?.severity).toBe('needsImprovement')
    expect(byUrl['https://example.com/poor']?.severity).toBe('poor')
    expect(report.severityCounts).toMatchObject({ good: 1, needsImprovement: 1, poor: 1, unknown: 0 })
  })

  it('records hasOriginFallback when at least one route falls back', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async (_url, init?: { body?: string }) => {
      const body = JSON.parse(init?.body as string) as { url?: string, origin?: string }
      call++
      if (body.url === 'https://example.com/hit')
        return jsonResponse(cruxRecord({ lcp: 1500 }, { url: body.url }))
      if (body.url === 'https://example.com/miss')
        return new Response('{}', { status: 404 })
      // Origin fallback for /miss.
      if (body.origin === 'https://example.com')
        return jsonResponse(cruxRecord({ lcp: 2800, cls: 0.05, inp: 150 }, { origin: body.origin }))
      return new Response('{}', { status: 404 })
    }) as never

    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler(ctxFor([
      buildRoute('https://example.com/hit'),
      buildRoute('https://example.com/miss'),
    ]))
    expect(report.hasOriginFallback).toBe(true)
    const miss = report.findings.find(f => f.url === 'https://example.com/miss')
    expect(miss?.source).toBe('origin')
    expect(miss?.severity).toBe('needsImprovement') // LCP 2800 > 2500
    const hit = report.findings.find(f => f.url === 'https://example.com/hit')
    expect(hit?.source).toBe('url')
    expect(call).toBeGreaterThanOrEqual(3)
  })

  it('marks routes as source=none when both CrUX endpoints miss', async () => {
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as never
    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler(ctxFor([buildRoute('https://example.com/missing')]))
    expect(report.hasOriginFallback).toBe(false)
    expect(report.findings[0]?.source).toBe('none')
    expect(report.findings[0]?.severity).toBe('unknown')
    expect(report.severityCounts.unknown).toBe(1)
  })

  it('catches per-route errors and continues, marking the failed row unknown', async () => {
    let call = 0
    globalThis.fetch = vi.fn(async (_url, init?: { body?: string }) => {
      call++
      const body = JSON.parse(init?.body as string) as { url?: string, origin?: string }
      if (body.url === 'https://example.com/boom')
        return new Response('{"error":"server"}', { status: 500 })
      if (body.url === 'https://example.com/ok')
        return jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 150 }, { url: body.url }))
      return new Response('{}', { status: 404 })
    }) as never

    const warns: string[] = []
    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler({
      ...ctxFor([buildRoute('https://example.com/boom'), buildRoute('https://example.com/ok')]),
      logger: { info: () => {}, warn: (m: string) => warns.push(m), error: () => {}, debug: () => {} } as never,
    })
    expect(report.findings).toHaveLength(2)
    expect(report.findings.find(f => f.url === 'https://example.com/boom')?.source).toBe('none')
    expect(report.findings.find(f => f.url === 'https://example.com/ok')?.source).toBe('url')
    expect(warns.some(m => m.includes('crux pack: query failed'))).toBe(true)
    expect(call).toBeGreaterThanOrEqual(2)
  })

  it('validates the report payload against the zod schema', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(cruxRecord({ lcp: 1500, cls: 0.05, inp: 150 }, { url: 'https://example.com/' })),
    ) as never
    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler(ctxFor([buildRoute('https://example.com/')]))
    const parsed = pack.reportSchema.safeParse(report)
    expect(parsed.success).toBe(true)
  })
})

// ── analyzeLabVsField — gap detector ────────────────────────────────────────
// Phase 11 / issue #349 — joins lab metrics (ScanRoute) with field findings
// (CrUX) per (url, device) and classifies the verdict pair.

describe('analyzeLabVsField', () => {
  function finding(over: Partial<CruxFinding> & { url: string }): CruxFinding {
    return {
      url: over.url,
      formFactor: over.formFactor ?? 'PHONE',
      lcp_p75: over.lcp_p75 ?? null,
      cls_p75: over.cls_p75 ?? null,
      inp_p75: over.inp_p75 ?? null,
      source: over.source ?? 'url',
      severity: over.severity ?? 'good',
    }
  }

  it('flags goodLabPoorField when lab passes but field reports poor', async () => {
    // Lab LCP 1200 (good) on /slow-in-the-wild, CrUX p75 5200 (poor).
    const routes = [buildRoute('https://example.com/slow-in-the-wild', { lcp: 1200 })]
    const findings = [finding({
      url: 'https://example.com/slow-in-the-wild',
      lcp_p75: 5200,
      cls_p75: 0.05, // both 'good' — aligned
      inp_p75: 150,
    })]

    const gap = analyzeLabVsField(routes, findings)
    expect(gap.goodLabPoorField).toHaveLength(1)
    expect(gap.goodLabPoorField[0]).toMatchObject({
      url: 'https://example.com/slow-in-the-wild',
      formFactor: 'PHONE',
      metric: 'lcp',
      labVerdict: 'good',
      fieldVerdict: 'poor',
      labValue: 1200,
      fieldValue: 5200,
    })
    // CLS + INP both 'good' on both sides — they slot into `aligned`.
    expect(gap.aligned.length).toBeGreaterThanOrEqual(2)
    expect(gap.poorLabGoodField).toHaveLength(0)
  })

  it('flags poorLabGoodField when lab is pessimistic but real users are fine', async () => {
    // Lab CLS 0.30 (poor — e.g. a flaky single-run measure), field CLS 0.05 (good).
    const routes = [buildRoute('https://example.com/lab-flaky', { lcp: 1200, cls: 0.30, inp: 100 })]
    const findings = [finding({
      url: 'https://example.com/lab-flaky',
      lcp_p75: 1500,
      cls_p75: 0.05,
      inp_p75: 100,
    })]

    const gap = analyzeLabVsField(routes, findings)
    expect(gap.poorLabGoodField).toHaveLength(1)
    expect(gap.poorLabGoodField[0]).toMatchObject({
      metric: 'cls',
      labVerdict: 'poor',
      fieldVerdict: 'good',
      labValue: 0.30,
      fieldValue: 0.05,
    })
    expect(gap.goodLabPoorField).toHaveLength(0)
  })

  it('skips findings with no field data (source=none)', async () => {
    const routes = [buildRoute('https://example.com/no-field', { lcp: 1200 })]
    const findings = [finding({
      url: 'https://example.com/no-field',
      lcp_p75: null,
      cls_p75: null,
      inp_p75: null,
      source: 'none',
      severity: 'unknown',
    })]

    const gap = analyzeLabVsField(routes, findings)
    expect(gap.goodLabPoorField).toHaveLength(0)
    expect(gap.poorLabGoodField).toHaveLength(0)
    expect(gap.aligned).toHaveLength(0)
  })

  it('skips findings with no matching lab route (e.g. URL not scanned on this device)', async () => {
    // Lab data only for mobile, CrUX finding only for DESKTOP → no overlap.
    const routes = [buildRoute('https://example.com/only-mobile', { device: 'mobile', lcp: 1200 })]
    const findings = [finding({
      url: 'https://example.com/only-mobile',
      formFactor: 'DESKTOP',
      lcp_p75: 1500,
    })]

    const gap = analyzeLabVsField(routes, findings)
    expect(gap.aligned).toHaveLength(0)
    expect(gap.goodLabPoorField).toHaveLength(0)
    expect(gap.poorLabGoodField).toHaveLength(0)
  })

  it('joins per (url, device) — mobile lab pairs with PHONE field, desktop with DESKTOP', async () => {
    // Same URL, two devices: mobile lab good vs PHONE field poor → gap on mobile.
    // Desktop lab good vs DESKTOP field good → aligned on desktop.
    const routes = [
      buildRoute('https://example.com/', { device: 'mobile', lcp: 1200 }),
      buildRoute('https://example.com/', { device: 'desktop', lcp: 800 }),
    ]
    const findings = [
      finding({ url: 'https://example.com/', formFactor: 'PHONE', lcp_p75: 5200 }),
      finding({ url: 'https://example.com/', formFactor: 'DESKTOP', lcp_p75: 1100 }),
    ]

    const gap = analyzeLabVsField(routes, findings)
    expect(gap.goodLabPoorField).toHaveLength(1)
    expect(gap.goodLabPoorField[0]).toMatchObject({ formFactor: 'PHONE', metric: 'lcp' })
    // The DESKTOP pair is good/good — lands in aligned.
    expect(gap.aligned.some(e => e.formFactor === 'DESKTOP' && e.metric === 'lcp')).toBe(true)
  })

  it('skips TABLET findings (no lab counterpart in this codebase)', async () => {
    const routes = [buildRoute('https://example.com/', { device: 'mobile', lcp: 1200 })]
    const findings = [finding({ url: 'https://example.com/', formFactor: 'TABLET', lcp_p75: 5200 })]
    const gap = analyzeLabVsField(routes, findings)
    expect(gap.goodLabPoorField).toHaveLength(0)
    expect(gap.aligned).toHaveLength(0)
  })

  it('handles partial metric coverage (e.g. INP missing from CrUX) without skipping the row', async () => {
    // LCP & CLS comparable, INP missing on field side → only 2 entries possible.
    const routes = [buildRoute('https://example.com/', { lcp: 1200, cls: 0.05, inp: 100 })]
    const findings = [finding({
      url: 'https://example.com/',
      lcp_p75: 1500,
      cls_p75: 0.08,
      inp_p75: null,
    })]

    const gap = analyzeLabVsField(routes, findings)
    const totalEntries
      = gap.goodLabPoorField.length + gap.poorLabGoodField.length + gap.aligned.length
    expect(totalEntries).toBe(2)
    // Both metrics land in `aligned` (good/good).
    expect(gap.aligned.map(e => e.metric).sort()).toEqual(['cls', 'lcp'])
  })
})

// ── gapAnalysis wired into cruxPack.run() ───────────────────────────────────

describe('cruxPack gapAnalysis integration', () => {
  beforeEach(() => {
    delete process.env.CRUX_API_KEY
  })

  it('produces empty buckets when no API key is set (stub path)', async () => {
    globalThis.fetch = vi.fn() as never
    const report = await cruxPack.reconciler(ctxFor([buildRoute('https://example.com/')]))
    expect(report.gapAnalysis).toEqual({
      goodLabPoorField: [],
      poorLabGoodField: [],
      aligned: [],
    })
  })

  it('emits a goodLabPoorField entry end-to-end through the reconciler', async () => {
    // Lab LCP 1200 (good) on the ScanRoute, CrUX returns p75 5200 (poor).
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(cruxRecord({ lcp: 5200, cls: 0.05, inp: 150 }, { url: 'https://example.com/' })),
    ) as never

    const pack = createCruxPack({ apiKey: 'fake' })
    const report = await pack.reconciler(ctxFor([buildRoute('https://example.com/', { lcp: 1200 })]))

    expect(report.gapAnalysis.goodLabPoorField).toHaveLength(1)
    expect(report.gapAnalysis.goodLabPoorField[0]).toMatchObject({
      metric: 'lcp',
      labVerdict: 'good',
      fieldVerdict: 'poor',
    })
  })
})
