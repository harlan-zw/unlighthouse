// D-030 — reconcileToContract projects raw LHR JSON to the ReconciledReport
// atom. The projection is what lets packs survive Lighthouse version drift:
// new audit IDs land in `audits[id]`, the severity bucketing stays stable.
//
// We test the projection in isolation (synthetic LHR → check fields), and
// once via the full ingest path (mock auditor → scan complete → verify the
// `.contract.json` blob is on disk).

import { ReconciledReport } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { reconcileToContract } from '@unlighthouse/core/report'
import { manualSeeds } from '@unlighthouse/core/seeds/manual'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

// ── Synthetic LHR fixture ──────────────────────────────────────────────────

function syntheticLhr() {
  return {
    lighthouseVersion: '12.0.0',
    userAgent: 'test-agent/1.0',
    categories: {
      'performance': {
        score: 0.85,
        auditRefs: [
          { id: 'first-contentful-paint', weight: 10 },
          { id: 'largest-contentful-paint', weight: 25 },
          { id: 'speed-index', weight: 10 },
        ],
      },
      'accessibility': {
        score: 0.92,
        auditRefs: [{ id: 'image-alt', weight: 10 }],
      },
      'best-practices': { score: null, auditRefs: [] },
      'seo': { score: 1.0, auditRefs: [] },
    },
    audits: {
      'first-contentful-paint': { score: 0.95, scoreDisplayMode: 'numeric', displayValue: '1.2s' },
      'largest-contentful-paint': { score: 0.4, scoreDisplayMode: 'numeric', displayValue: '4.8s' },
      'speed-index': { score: 0.7, scoreDisplayMode: 'numeric', displayValue: '3.1s' },
      'image-alt': { score: 0, scoreDisplayMode: 'binary', displayValue: null },
      'manual-only': { score: null, scoreDisplayMode: 'manual', displayValue: null },
      'not-applicable': { score: null, scoreDisplayMode: 'notApplicable', displayValue: null },
      'informative': { score: null, scoreDisplayMode: 'informative', displayValue: '7 KB' },
    },
  } as never
}

describe('reconcileToContract', () => {
  it('produces a contract-shape ReconciledReport from a synthetic LHR', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: syntheticLhr(),
    })
    // Round-trip through the Zod schema — the strongest assertion that the
    // shape matches the contract.
    expect(() => ReconciledReport.parse(out)).not.toThrow()
  })

  it('derives severity per audit (the bucketing pack reconcilers depend on)', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: syntheticLhr(),
    })
    // score >= 0.9 → pass
    expect(out.audits['first-contentful-paint'].severity).toBe('pass')
    // 0.5 <= score < 0.9 → warn
    expect(out.audits['speed-index'].severity).toBe('warn')
    // score < 0.5 → fail
    expect(out.audits['largest-contentful-paint'].severity).toBe('fail')
    // binary score 0 → fail
    expect(out.audits['image-alt'].severity).toBe('fail')
    // manual / notApplicable / informative → pass (they never block a scan)
    expect(out.audits['manual-only'].severity).toBe('pass')
    expect(out.audits['not-applicable'].severity).toBe('pass')
    expect(out.audits.informative.severity).toBe('pass')
  })

  it('captures category roll-ups including auditRefs for pack iteration', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: syntheticLhr(),
    })
    expect(out.categories.performance?.score).toBe(0.85)
    // auditRefs carries id + weight so packs like seo-basics can derive
    // severity from category weighting without re-fetching the raw LHR.
    expect(out.categories.performance?.auditRefs).toEqual([
      { id: 'first-contentful-paint', weight: 10 },
      { id: 'largest-contentful-paint', weight: 25 },
      { id: 'speed-index', weight: 10 },
    ])
    // Null-score categories survive intact (best-practices has no audits run).
    expect(out.categories['best-practices']?.score).toBeNull()
    expect(out.categories['best-practices']?.auditRefs).toEqual([])
  })

  it('projects audit title + description so packs can render labels without the raw LHR', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: {
        ...syntheticLhr(),
        audits: {
          ...(syntheticLhr() as { audits: Record<string, unknown> }).audits,
          'with-labels': {
            score: 0.5,
            scoreDisplayMode: 'numeric',
            displayValue: null,
            title: 'Reduce JavaScript execution time',
            description: 'Consider reducing the time spent parsing, compiling, and executing JS.',
          },
        },
      } as never,
    })
    expect(out.audits['with-labels'].title).toBe('Reduce JavaScript execution time')
    expect(out.audits['with-labels'].description).toMatch(/parsing/)
    // Audits without a title fall back to null, not "" (consumers branch on null).
    expect(out.audits['first-contentful-paint'].title).toBeNull()
  })

  it('projects metricSavings only when at least one savings field is numeric', () => {
    const out = reconcileToContract({
      scanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      url: 'http://example.com/',
      device: 'mobile',
      lhr: {
        ...syntheticLhr(),
        audits: {
          ...(syntheticLhr() as { audits: Record<string, unknown> }).audits,
          'render-blocking-insight': {
            score: 0.6,
            scoreDisplayMode: 'numeric',
            displayValue: '250 ms',
            metricSavings: { FCP: 250, LCP: 180 },
          },
          'empty-savings': {
            score: 0.9,
            scoreDisplayMode: 'numeric',
            displayValue: null,
            metricSavings: {},
          },
        },
      } as never,
    })
    expect(out.audits['render-blocking-insight'].metricSavings).toEqual({ FCP: 250, LCP: 180 })
    // Empty objects collapse to null so pack guards (`if (m.metricSavings)`) work.
    expect(out.audits['empty-savings'].metricSavings).toBeNull()
    // Audits without the field stay null.
    expect(out.audits['first-contentful-paint'].metricSavings).toBeNull()
  })
})

// ── Integration: ingest writes the .contract.json blob ──────────────────────

describe('scan ingest persists reconciled contract blob', () => {
  let storage: ReturnType<typeof memoryStorage>
  let scanId: string

  beforeAll(async () => {
    storage = memoryStorage()
    const auditor = createMockAuditor()
    const core = createUnlighthouseCore({
      config: { site: 'http://example.com' } as never,
      auditor,
      seeds: manualSeeds({ urls: ['http://example.com/'] }),
      crawler: parallelMapCrawler({ concurrency: 1 }),
      storage,
    })
    const session = core.run()
    await session.done
    scanId = session.scanId
  })

  it('writes scans/{id}/reports/{urlHash}.contract.json alongside the LHR blob', async () => {
    const url = 'http://example.com/'
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
    const contractKey = `scans/${scanId}/reports/${hash}.contract.json`

    const buf = await storage.blobs.get(contractKey)
    expect(buf).not.toBeNull()
    expect(buf!.byteLength).toBeGreaterThan(0)

    const parsed = JSON.parse(new TextDecoder().decode(buf!))
    // Validate it against the contract.
    expect(() => ReconciledReport.parse(parsed)).not.toThrow()
    expect(parsed.scanId).toBe(scanId)
    expect(parsed.url).toBe(url)
    expect(parsed.device).toBe('mobile')
  })

  it('contract blob is independent of the v0 UI reconciled blob', async () => {
    // The two reconciled blobs co-exist: scans/.../reports/{hash}.json (UI)
    // and scans/.../reports/{hash}.contract.json (packs). Sanity-check both
    // wrote out so a future cleanup doesn't accidentally remove the wrong one.
    const url = 'http://example.com/'
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
    expect(await storage.blobs.has(`scans/${scanId}/reports/${hash}.json`)).toBe(true)
    expect(await storage.blobs.has(`scans/${scanId}/reports/${hash}.contract.json`)).toBe(true)
  })
})
