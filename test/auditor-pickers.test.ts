import type { Auditor, AuditorCapabilities, LighthouseReport, NamedAuditor } from '../packages/contracts/src/ports/auditor'
import { describe, expect, it } from 'vitest'
import {
  fallbackAuditor,
  predicatePick,
  rateLimitedPick,
  roundRobinPick,
  weightedPick,
} from '../packages/core/src/auditors/route'

const caps: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: ['performance'],
}

function stubAuditor(label: string): Auditor {
  return {
    capabilities: caps,
    async audit() {
      return { label } as unknown as LighthouseReport
    },
  }
}

function named(name: string): NamedAuditor {
  return { name, auditor: stubAuditor(name) }
}

describe('roundRobinPick', () => {
  it('returns auditors in rotation', async () => {
    const pick = roundRobinPick()
    const list = [named('a'), named('b'), named('c')]
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      const got = await pick(list, { url: 'https://x' })
      const report = await got.audit('https://x') as unknown as { label: string }
      seen.push(report.label)
    }
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
  })
})

describe('fallbackAuditor', () => {
  it('returns first auditor result when it succeeds', async () => {
    const composed = fallbackAuditor([named('a'), named('b')])
    const r = await composed.audit('https://x') as unknown as { label: string }
    expect(r.label).toBe('a')
  })

  it('advances to next auditor on error', async () => {
    const failing: Auditor = {
      capabilities: caps,
      async audit() { throw new Error('boom') },
    }
    const composed = fallbackAuditor([
      { name: 'a', auditor: failing },
      named('b'),
    ])
    const r = await composed.audit('https://x') as unknown as { label: string }
    expect(r.label).toBe('b')
  })

  it('throws AggregateError when every auditor fails', async () => {
    const fail = (msg: string): Auditor => ({
      capabilities: caps,
      async audit() { throw new Error(msg) },
    })
    const composed = fallbackAuditor([
      { name: 'a', auditor: fail('one') },
      { name: 'b', auditor: fail('two') },
    ])
    await expect(composed.audit('https://x')).rejects.toBeInstanceOf(AggregateError)
  })
})

describe('weightedPick', () => {
  it('over 1000 picks, ratio is roughly 9:1 (±5%)', async () => {
    const list = [named('a'), named('b')]
    const pick = weightedPick({ a: 9, b: 1 })
    let aCount = 0
    let bCount = 0
    const n = 1000
    for (let i = 0; i < n; i++) {
      const got = await pick(list, { url: 'https://x' })
      const r = await got.audit('https://x') as unknown as { label: string }
      if (r.label === 'a')
        aCount++
      else
        bCount++
    }
    const aRatio = aCount / n
    expect(aRatio).toBeGreaterThanOrEqual(0.85)
    expect(aRatio).toBeLessThanOrEqual(0.95)
    expect(aCount + bCount).toBe(n)
  })
})

describe('rateLimitedPick', () => {
  it("doesn't throw under permissive predicate", async () => {
    const pick = rateLimitedPick(async () => true)
    const list = [named('a'), named('b')]
    const got = await pick(list, { url: 'https://x' })
    const r = await got.audit('https://x') as unknown as { label: string }
    expect(r.label).toBe('a')
  })

  it('throws when no auditor passes check', async () => {
    const pick = rateLimitedPick(async () => false)
    await expect(pick([named('a')], { url: 'https://x' })).rejects.toThrow(/no auditor passed/)
  })
})

describe('predicatePick', () => {
  it('routes to auditor whose name matches predicate(url)', async () => {
    const list = [named('crux'), named('local')]
    const pick = predicatePick((url) => {
      return url.includes('localhost') ? 'local' : 'crux'
    })
    const remote = await pick(list, { url: 'https://example.com' })
    const r1 = await remote.audit('https://example.com') as unknown as { label: string }
    expect(r1.label).toBe('crux')

    const local = await pick(list, { url: 'http://localhost:3000' })
    const r2 = await local.audit('http://localhost:3000') as unknown as { label: string }
    expect(r2.label).toBe('local')
  })
})
