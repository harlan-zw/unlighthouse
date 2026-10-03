import { describe, expect, it, vi } from 'vitest'
import { createCiCli, runCi } from '../src/cli/ci'
import { pickCiOptions } from '../src/cli/util'

const state = vi.hoisted(() => ({ score: 0 as number | null, budget: 80 as number | Record<string, number>, generated: vi.fn() }))
vi.mock('../src/index.ts', () => ({
  createUnlighthouseHost: async () => ({
    resolvedConfig: { site: 'https://example.com', ci: { budget: state.budget, reporter: false, buildStatic: true } },
    start: async () => ({ scanId: 'scan', done: Promise.resolve({ summary: { completed: 1, failed: 0 } }) }),
    handlerCtx: { storage: {
      routes: { listForScan: async () => ({ items: [{ path: '/', url: 'https://example.com/', device: 'mobile', reportBlobKey: 'report.json' }] }) },
      blobs: { get: async () => new TextEncoder().encode(JSON.stringify({ scanId: 'scan', url: 'https://example.com/', device: 'mobile', metrics: { scorePerformance: state.score, scoreAccessibility: null, scoreSeo: null, scoreBestPractices: null, lcp: null, cls: null, inp: null, fcp: null, ttfb: null, tbt: null, si: null }, categories: { performance: { score: state.score, auditRefs: [] } }, audits: {}, stackPacks: null, entities: null, provenance: { lighthouseVersion: '13.0.0', userAgent: null, capturedAt: '2026-10-03T00:00:00.000Z', benchmarkIndex: null, timingTotal: null, warnings: [], runtimeError: null } })) },
    } },
    runtimeSettings: {},
    generateClient: state.generated,
  }),
}))

describe('cI backports', () => {
  it.each([0, 0.79, 0.8, null])('checks configured budgets with reporter disabled: %s', async (score) => {
    state.score = score
    state.budget = 80
    state.generated.mockClear()
    expect(await runCi({ argv: ['node', 'ci'], env: {} })).toBe(score !== null && score < 0.8 ? 1 : 0)
    expect(state.generated).toHaveBeenCalled()
  })

  it('applies only configured category budgets', async () => {
    state.score = 0
    state.budget = { seo: 90 }
    expect(await runCi({ argv: ['node', 'ci'], env: {} })).toBe(0)
    state.budget = { performance: 90 }
    expect(await runCi({ argv: ['node', 'ci'], env: {} })).toBe(1)
  })

  it('maps explicit CI flags without creating defaults', () => {
    const parse = (flags: string[]) => createCiCli().parse(['node', 'ci', ...flags]).options
    expect(pickCiOptions(parse([])).ci).toEqual({})
    expect(pickCiOptions(parse(['--budget', '90', '--build-static', '--reporter', 'false'])).ci).toEqual({ budget: 90, buildStatic: true, reporter: false })
  })
})
