import type { Auditor, AuditorCapabilities, NamedAuditor, RateLimiter } from '@unlighthouse/contracts/ports'
import {
  fallbackAuditor,
  predicatePick,
  rateLimitedPick,
  roundRobinPick,
  routeAuditors,
  weightedPick,
} from '@unlighthouse/core/auditors/route'
import { describe, expect, it } from 'vitest'

const caps: AuditorCapabilities = {
  reliablePerfScores: true,
  reliableFieldData: false,
  supportsThrottling: true,
  categories: ['performance'],
}

function stubAuditor(label: string, categories: AuditorCapabilities['categories'] = ['performance']): Auditor {
  return {
    capabilities: { ...caps, categories },
    async audit() {
      return {
        requestedUrl: 'https://x',
        finalUrl: 'https://x',
        lighthouseVersion: '13.4.0',
        categories: {},
        audits: {},
        auditor: label,
      }
    },
  }
}

function named(name: string, categories?: AuditorCapabilities['categories']): NamedAuditor {
  return { name, auditor: stubAuditor(name, categories) }
}

// Minimal RateLimiter stub whose verdict is fixed for every bucket.
function limiterAlways(allowed: boolean): RateLimiter {
  return {
    check: async () => ({ allowed }),
    consume: async () => {},
    remaining: async () => null,
  }
}

describe('roundRobinPick', () => {
  it('returns auditors in rotation', async () => {
    const pick = roundRobinPick()
    const list = [named('a'), named('b'), named('c')]
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      const got = await pick(list, { url: 'https://x' })
      const report = await got.audit('https://x')
      seen.push(report.auditor ?? '')
    }
    expect(seen).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
  })
})

describe('fallbackAuditor', () => {
  it('returns first auditor result when it succeeds', async () => {
    const composed = fallbackAuditor([named('a'), named('b')])
    const r = await composed.audit('https://x')
    expect(r.auditor).toBe('a')
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
    const r = await composed.audit('https://x')
    expect(r.auditor).toBe('b')
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

  it('skips fallback candidates that do not support the requested category', async () => {
    const composed = fallbackAuditor([
      named('psi', ['performance']),
      named('local', ['performance', 'agentic-browsing']),
    ])
    const r = await composed.audit('https://x', undefined, {
      lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
    })
    expect(r.auditor).toBe('local')
  })
})

describe('routeAuditors', () => {
  it('filters candidates by requested Lighthouse categories before picking', async () => {
    const composed = routeAuditors({
      auditors: [
        named('psi', ['performance']),
        named('local', ['performance', 'agentic-browsing']),
      ],
      pick: roundRobinPick(),
    })

    const r = await composed.audit('https://x', undefined, {
      lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
    })

    expect(r.auditor).toBe('local')
  })

  it('throws before picking when no auditor supports the requested category', async () => {
    const composed = routeAuditors({
      auditors: [named('psi', ['performance'])],
      pick: roundRobinPick(),
    })

    await expect(composed.audit('https://x', undefined, {
      lighthouseFlags: { onlyCategories: ['agentic-browsing'] },
    })).rejects.toThrow(/no auditor supports Lighthouse categories: agentic-browsing/)
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
      const r = await got.audit('https://x')
      if (r.auditor === 'a')
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
  it('doesn\'t throw under permissive limiter', async () => {
    const pick = rateLimitedPick(limiterAlways(true))
    const list = [named('a'), named('b')]
    const got = await pick(list, { url: 'https://x' })
    const r = await got.audit('https://x')
    expect(r.auditor).toBe('a')
  })

  it('throws when no auditor passes check', async () => {
    const pick = rateLimitedPick(limiterAlways(false))
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
    const r1 = await remote.audit('https://example.com')
    expect(r1.auditor).toBe('crux')

    const local = await pick(list, { url: 'http://localhost:3000' })
    const r2 = await local.audit('http://localhost:3000')
    expect(r2.auditor).toBe('local')
  })
})
