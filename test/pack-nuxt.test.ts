// Tests for the @unlighthouse/core/packs/nuxt reference pack: it maps failing
// Lighthouse audits to Nuxt-idiomatic fixes, aggregates across routes, detects
// Nuxt via stack packs, and emits a report that validates against its schema.

import type { PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { AuditFinding, ReconciledReport, ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { NuxtReportSchema, nuxtPack } from '@unlighthouse/core/packs/nuxt'
import { describe, expect, it } from 'vitest'

const SCAN_ID = 'nuxt-pack-scan' as ScanId

function finding(overrides: Partial<AuditFinding> & Pick<AuditFinding, 'id' | 'severity'>): AuditFinding {
  return {
    score: overrides.severity === 'fail' ? 0.2 : 0.6,
    scoreDisplayMode: 'numeric',
    displayValue: null,
    title: `${overrides.id} title`,
    description: null,
    metricSavings: null,
    items: null,
    ...overrides,
  }
}

function makeReport(url: string, opts: { audits: AuditFinding[], nuxt?: boolean }): ReconciledReport {
  return {
    scanId: SCAN_ID,
    url,
    device: 'mobile',
    metrics: {
      scorePerformance: 0.5,
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
    },
    categories: {},
    audits: Object.fromEntries(opts.audits.map(a => [a.id, a])),
    provenance: {
      lighthouseVersion: '13.4.0',
      userAgent: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
      benchmarkIndex: null,
      timingTotal: null,
      warnings: [],
      runtimeError: null,
    },
    stackPacks: opts.nuxt ? [{ id: 'nuxt', title: 'Nuxt.js', iconDataURL: null, descriptions: {} }] : null,
    entities: null,
  }
}

function makeRoute(url: string): ScanRoute {
  return {
    url: url as ScanRoute['url'],
    path: new URL(url).pathname,
    routeName: null,
    scorePerformance: 0.5,
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
    scanId: SCAN_ID,
    device: 'mobile',
    lhrBlobKey: `scans/${SCAN_ID}/lhr/x.json.gz`,
  }
}

function ctxFor(reports: Record<string, ReconciledReport>): PackReconcileCtx {
  return {
    scanId: SCAN_ID,
    routes: Object.keys(reports).map(makeRoute),
    getReconciled: async (url: string) => reports[url] ?? null,
  }
}

describe('@unlighthouse/core/packs/nuxt', () => {
  it('maps a failing image audit to the @nuxt/image fix', async () => {
    const report = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', {
        audits: [finding({ id: 'modern-image-formats', severity: 'fail' })],
      }),
    }))
    const f = report.findings.find(x => x.auditId === 'modern-image-formats')
    expect(f).toBeDefined()
    expect(f!.module).toBe('@nuxt/image')
    expect(f!.fix).toMatch(/NuxtImg|@nuxt\/image/)
    expect(f!.severity).toBe('fail')
  })

  it('aggregates the same audit across routes into one finding', async () => {
    const audit = finding({ id: 'modern-image-formats', severity: 'warn', metricSavings: { LCP: 300 } })
    const report = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', { audits: [audit] }),
      'https://a.com/blog': makeReport('https://a.com/blog', { audits: [audit] }),
    }))
    const f = report.findings.find(x => x.auditId === 'modern-image-formats')!
    expect(f.routeCount).toBe(2)
    expect(f.routes).toHaveLength(2)
    expect(f.estimatedSavings).toEqual({ LCP: 600 })
  })

  it('ignores passing audits and unmapped audits', async () => {
    const report = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', {
        audits: [
          finding({ id: 'modern-image-formats', severity: 'pass' }),
          finding({ id: 'some-unmapped-audit', severity: 'fail' }),
        ],
      }),
    }))
    expect(report.findings).toHaveLength(0)
  })

  it('detects Nuxt from a stack pack', async () => {
    const withNuxt = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', { audits: [finding({ id: 'unused-javascript', severity: 'fail' })], nuxt: true }),
    }))
    expect(withNuxt.nuxtDetected).toBe(true)

    const withoutNuxt = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', { audits: [finding({ id: 'unused-javascript', severity: 'fail' })] }),
    }))
    expect(withoutNuxt.nuxtDetected).toBe(false)
  })

  it('emits a report that validates against its own schema', async () => {
    const report = await nuxtPack.reconciler(ctxFor({
      'https://a.com/': makeReport('https://a.com/', {
        audits: [
          finding({ id: 'render-blocking-resources', severity: 'fail' }),
          finding({ id: 'server-response-time', severity: 'warn' }),
        ],
      }),
    }))
    expect(() => NuxtReportSchema.parse(report)).not.toThrow()
    // Fails sort before warns.
    expect(report.findings[0]!.severity).toBe('fail')
  })
})
