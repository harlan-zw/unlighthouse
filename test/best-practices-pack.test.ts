// Proves the `best-practices` pack (D-045) reconciles findings from a
// reconciled report the same way seo-basics/a11y-quick-wins/agentic-browsing
// do: failing (score < 1, non-null) audits under `categories['best-practices']`
// grouped by audit id, severity derived from weight, element samples pulled
// from the reconciled projection's `items` (best-practices audits are in the
// PROJECTED_DETAIL_AUDITS allowlist so this doesn't need a raw-LHR fallback
// for the happy path — that fallback is covered separately below).

import type { ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { BestPracticesReportSchema } from '@unlighthouse/contracts/packs'
import { bestPracticesPack } from '@unlighthouse/core/packs'
import { describe, expect, it } from 'vitest'

const route = {
  scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  url: 'http://example.com/',
  path: '/',
  routeName: null,
  device: 'mobile',
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
  lhrBlobKey: 'lhr',
  reportBlobKey: 'report',
  screenshotBlobKey: null,
} as unknown as ScanRoute

// `items` mirrors the real `AuditDetailItemSchema` shape (node-nested) — the
// pack reads `it.node?.selector`, not a flat `.selector`.
interface RawDetailItem {
  url: string | null
  type: string | null
  totalBytes: number | null
  wastedBytes: number | null
  node: { selector: string | null, snippet: string | null, nodeLabel: string | null } | null
  snippet: string | null
  reason: string | null
  entity: string | null
  blockingTime: number | null
  transferSize: number | null
  wastedMs: number | null
}

function detailItem(node: { selector?: string, snippet?: string, nodeLabel?: string }): RawDetailItem {
  return {
    url: null,
    type: null,
    totalBytes: null,
    wastedBytes: null,
    node: { selector: node.selector ?? null, snippet: node.snippet ?? null, nodeLabel: node.nodeLabel ?? null },
    snippet: null,
    reason: null,
    entity: null,
    blockingTime: null,
    transferSize: null,
    wastedMs: null,
  }
}

function audit(overrides: Partial<{
  id: string
  score: number | null
  scoreDisplayMode: string
  title: string | null
  description: string | null
  items: RawDetailItem[] | null
}> = {}) {
  const score = overrides.score ?? null
  return {
    id: overrides.id ?? 'audit',
    score,
    scoreDisplayMode: overrides.scoreDisplayMode ?? 'binary',
    numericValue: null,
    displayValue: null,
    title: overrides.title ?? null,
    description: overrides.description ?? null,
    severity: score == null || score >= 0.9 ? 'pass' : score >= 0.5 ? 'warn' : 'fail',
    metricSavings: null,
    items: overrides.items ?? null,
  }
}

function reconciled(overrides: Partial<ReconciledReport> = {}): ReconciledReport {
  return {
    scanId: route.scanId,
    url: route.url,
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
        auditRefs: [
          { id: 'is-on-https', weight: 1 },
          { id: 'image-aspect-ratio', weight: 1 },
          { id: 'has-hsts', weight: 3 },
        ],
      },
    },
    audits: {
      'is-on-https': audit({ id: 'is-on-https', score: 1, title: 'Uses HTTPS' }),
      'image-aspect-ratio': audit({
        id: 'image-aspect-ratio',
        score: 0,
        title: 'Displays images with correct aspect ratio',
        description: 'Image display dimensions should match natural aspect ratio.',
        items: [detailItem({ selector: 'img.hero', snippet: '<img class="hero">', nodeLabel: 'hero image' })],
      }),
      'has-hsts': audit({ id: 'has-hsts', score: 0, title: 'Uses a strong HSTS policy' }),
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

describe('bestPracticesPack', () => {
  it('groups failing best-practices audits by id, deriving severity from weight', async () => {
    const report = await bestPracticesPack.reconciler({
      scanId: route.scanId,
      routes: [route],
      getReconciled: async () => reconciled(),
      getLhr: async () => null,
    })

    expect(() => BestPracticesReportSchema.parse(report)).not.toThrow()
    expect(report.routesAnalysed).toBe(1)

    // Passing audit (is-on-https, score 1) is excluded entirely.
    expect(report.findings.find(f => f.auditId === 'is-on-https')).toBeUndefined()

    // Failing, weight-1 audit → 'serious'.
    const aspectRatio = report.findings.find(f => f.auditId === 'image-aspect-ratio')
    expect(aspectRatio).toBeDefined()
    expect(aspectRatio?.severity).toBe('serious')
    expect(aspectRatio?.routeCount).toBe(1)
    expect(aspectRatio?.sampleElements).toHaveLength(1)
    expect(aspectRatio?.sampleElements[0].selector).toBe('img.hero')

    // Failing, weight-3 audit → 'critical'.
    const hsts = report.findings.find(f => f.auditId === 'has-hsts')
    expect(hsts).toBeDefined()
    expect(hsts?.severity).toBe('critical')

    expect(report.severityCounts.critical).toBe(1)
    expect(report.severityCounts.serious).toBe(1)
  })

  it('falls back to raw LHR when reconciled is unavailable (older scan)', async () => {
    const report = await bestPracticesPack.reconciler({
      scanId: route.scanId,
      routes: [route],
      getReconciled: async () => null,
      getLhr: async () => ({
        categories: { 'best-practices': { auditRefs: [{ id: 'errors-in-console', weight: 1 }] } },
        audits: {
          'errors-in-console': { score: 0, title: 'No errors logged to console', description: 'Errors in console.' },
        },
      }),
    })

    expect(report.routesAnalysed).toBe(1)
    const finding = report.findings.find(f => f.auditId === 'errors-in-console')
    expect(finding).toBeDefined()
    expect(finding?.fixHint).toContain('console')
  })

  it('excludes informative/notApplicable/manual audits (null score)', async () => {
    const report = await bestPracticesPack.reconciler({
      scanId: route.scanId,
      routes: [route],
      getReconciled: async () => reconciled({
        categories: {
          'best-practices': {
            score: null,
            categoryScoreDisplayMode: 'fraction',
            auditRefs: [{ id: 'js-libraries', weight: 1 }],
          },
        },
        audits: {
          'js-libraries': audit({ id: 'js-libraries', score: null, scoreDisplayMode: 'informative', title: 'Detected JS libraries' }),
        },
      }),
      getLhr: async () => null,
    })

    expect(report.findings).toHaveLength(0)
  })
})
