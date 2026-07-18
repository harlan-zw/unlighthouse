// D-040: multi-sample runs pin to one backend under round-robin (so
// computeMedianRun never mixes measurement conditions).
// D-041: splitCategoriesAuditor fans categories to distinct backends and merges
// the disjoint results with per-category provenance; invalid assignments throw.

import type { AuditOpts, Auditor, Category, NamedAuditor } from '@unlighthouse/contracts/ports'
import { describe, expect, it } from 'vitest'
import { roundRobinPick, routeAuditors, splitCategoriesAuditor } from '../src/auditors/route'

function namedAuditor(name: string, categories: Category[], calls: string[]): NamedAuditor {
  const auditor: Auditor = {
    capabilities: { reliablePerfScores: true, reliableFieldData: false, supportsThrottling: true, categories },
    async audit(_url: string, _page?: unknown, _opts?: AuditOpts) {
      calls.push(name)
      const cats: Record<string, { score: number }> = {}
      for (const c of categories)
        cats[c] = { score: 0.9 }
      return {
        requestedUrl: 'https://x.com/',
        finalUrl: 'https://x.com/',
        lighthouseVersion: '13.4.0',
        categories: cats,
        audits: {},
      }
    },
  }
  return { name, auditor }
}

describe('d-040 sample pinning', () => {
  it('pins the picked backend across a sample group under round-robin', async () => {
    const calls: string[] = []
    const a = namedAuditor('a', ['performance'], calls)
    const b = namedAuditor('b', ['performance'], calls)
    const router = routeAuditors({ auditors: [a, b], pick: roundRobinPick() })

    // 3 samples of ONE route — all must hit the same adapter.
    await router.audit('https://x.com/one', undefined, { device: 'mobile', sample: { index: 0, total: 3 } })
    await router.audit('https://x.com/one', undefined, { device: 'mobile', sample: { index: 1, total: 3 } })
    await router.audit('https://x.com/one', undefined, { device: 'mobile', sample: { index: 2, total: 3 } })

    expect(new Set(calls).size).toBe(1)
    expect(calls).toHaveLength(3)
  })

  it('still round-robins across distinct routes', async () => {
    const calls: string[] = []
    const a = namedAuditor('a', ['performance'], calls)
    const b = namedAuditor('b', ['performance'], calls)
    const router = routeAuditors({ auditors: [a, b], pick: roundRobinPick() })
    // Single audit per route (no sample group) → round-robin alternates.
    await router.audit('https://x.com/one', undefined, { device: 'mobile' })
    await router.audit('https://x.com/two', undefined, { device: 'mobile' })
    expect(new Set(calls).size).toBe(2)
  })
})

describe('d-041 splitCategoriesAuditor', () => {
  it('merges disjoint categories with per-category provenance', async () => {
    const calls: string[] = []
    const local = namedAuditor('local', ['performance'], calls)
    const psi = namedAuditor('psi', ['seo', 'accessibility'], calls)
    const split = splitCategoriesAuditor({
      assignments: { performance: local, seo: psi, accessibility: psi },
    })

    const report = await split.audit('https://x.com/', undefined, {})

    // Both backends contributed; one run each (psi owns two categories).
    expect(calls.sort()).toEqual(['local', 'psi'])
    expect(Object.keys(report.categories).sort()).toEqual(['accessibility', 'performance', 'seo'])
    expect(report.auditor).toBe('split')
    expect(report.auditors).toEqual({ performance: 'local', seo: 'psi', accessibility: 'psi' })
  })

  it('collapses row auditor to the single backend when categories do not diverge', async () => {
    const calls: string[] = []
    const psi = namedAuditor('psi', ['seo', 'accessibility'], calls)
    const split = splitCategoriesAuditor({ assignments: { seo: psi, accessibility: psi } })
    const report = await split.audit('https://x.com/', undefined, {})
    expect(report.auditor).toBe('psi')
  })

  it('throws CONFIG_INVALID when a backend does not support its assigned category', () => {
    const calls: string[] = []
    const local = namedAuditor('local', ['performance'], calls)
    expect(() => splitCategoriesAuditor({ assignments: { seo: local } }))
      .toThrowError(/CONFIG_INVALID|does not support/)
  })

  it('throws CONFIG_INVALID for empty assignments', () => {
    expect(() => splitCategoriesAuditor({ assignments: {} })).toThrowError(/CONFIG_INVALID|at least one/)
  })
})
