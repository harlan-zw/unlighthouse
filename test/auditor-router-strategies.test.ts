// AuditorRouter `weighted` and `rate-limited` strategies are now config-
// driven via `AuditorConfig.router.weights` / `.rates`. Pre-this PR the
// router was wired in but the strategies fell through to permissive
// defaults regardless of config.
//
// Two surfaces under test:
//   - the token-bucket helper itself (deterministic via injected clock)
//   - the picker layer it backs (rate-limited skips empty buckets;
//     weighted respects the weights map)

import type { NamedAuditor } from '@unlighthouse/contracts/ports'
import {
  createTokenBucket,
  rateLimitedPick,
  weightedPick,
} from '@unlighthouse/core/auditors'
import { describe, expect, it } from 'vitest'

// Build a stand-in auditor whose audit() returns its own name. Lets the
// picker tests assert which provider got selected by reading the result.
function stub(name: string): NamedAuditor {
  return {
    name,
    auditor: {
      capabilities: {
        reliablePerfScores: true,
        reliableFieldData: false,
        supportsThrottling: true,
        categories: ['performance'],
      },
      async audit() {
        return { source: name } as never
      },
    },
  }
}

describe('createTokenBucket', () => {
  it('consumes tokens up to capacity then refuses', () => {
    let t = 0
    const b = createTokenBucket({ psi: { capacity: 3, refillPerSec: 1 } }, () => t)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(false) // bucket empty
  })

  it('refills continuously by elapsed wall time', () => {
    let t = 0
    const b = createTokenBucket({ psi: { capacity: 2, refillPerSec: 2 } }, () => t)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(false)
    t += 500 // 0.5s × 2/s = 1 token
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(false)
    t += 2000 // 2s × 2/s = 4 tokens but capacity caps at 2
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(false)
  })

  it('is permissive for providers without a declared rule', () => {
    const b = createTokenBucket({ psi: { capacity: 1, refillPerSec: 1 } })
    // 'local' has no rule — try() always wins.
    for (let i = 0; i < 100; i++)
      expect(b.try('local')).toBe(true)
    // psi still rate-limited.
    expect(b.try('psi')).toBe(true)
    expect(b.try('psi')).toBe(false)
  })

  it('exposes token count for observability', () => {
    let t = 0
    const b = createTokenBucket({ psi: { capacity: 2, refillPerSec: 1 } }, () => t)
    b.try('psi')
    expect(b.tokensFor('psi')).toBeCloseTo(1, 5)
    t += 1000
    // tokensFor refills lazily on access; should show capacity again.
    expect(b.tokensFor('psi')).toBeCloseTo(2, 5)
    // Unknown name returns null (permissive bucket has no state).
    expect(b.tokensFor('local')).toBeNull()
  })
})

describe('weightedPick', () => {
  it('routes ~3:1 to a 3-weighted provider over a 1-weighted one', () => {
    const pick = weightedPick({ psi: 3, local: 1 })
    const auditors = [stub('psi'), stub('local')]
    const counts = { psi: 0, local: 0 }
    for (let i = 0; i < 4000; i++) {
      const got = pick(auditors, { url: '/' }) as { audit: () => Promise<{ source: string }> }
      // We can't call audit() synchronously, but the picked auditor's identity
      // round-trips through reference equality — find which stub matches.
      counts[(got === auditors[0].auditor ? 'psi' : 'local')]++
    }
    // 3:1 ratio with 4000 trials should land within tight bounds.
    expect(counts.psi / counts.local).toBeGreaterThan(2.5)
    expect(counts.psi / counts.local).toBeLessThan(3.5)
  })

  it('treats absent names as weight 1 (equal share fallback)', () => {
    const pick = weightedPick({}) // empty config
    const auditors = [stub('a'), stub('b')]
    const counts = { a: 0, b: 0 }
    for (let i = 0; i < 2000; i++) {
      const got = pick(auditors, { url: '/' })
      counts[(got === auditors[0].auditor ? 'a' : 'b')]++
    }
    // Equal weights → ~1:1, allow ±10%.
    const ratio = counts.a / counts.b
    expect(ratio).toBeGreaterThan(0.85)
    expect(ratio).toBeLessThan(1.15)
  })

  it('an explicit weight of 0 excludes that provider', () => {
    const pick = weightedPick({ a: 0, b: 5 })
    const auditors = [stub('a'), stub('b')]
    for (let i = 0; i < 200; i++) {
      const got = pick(auditors, { url: '/' })
      expect(got).toBe(auditors[1].auditor) // never picks a
    }
  })
})

describe('rateLimitedPick', () => {
  it('routes to a provider that passes the check; falls through to the next when one fails', async () => {
    let t = 0
    const bucket = createTokenBucket({
      psi: { capacity: 1, refillPerSec: 0.001 }, // basically empty after first use
      local: { capacity: 100, refillPerSec: 1 },
    }, () => t)
    const pick = rateLimitedPick(async name => bucket.try(name))
    const auditors = [stub('psi'), stub('local')]

    // First call drains psi (1 token).
    const first = await pick(auditors, { url: '/' })
    expect(first).toBe(auditors[0].auditor)
    // psi now empty; next call falls through to local.
    const second = await pick(auditors, { url: '/' })
    expect(second).toBe(auditors[1].auditor)
  })

  it('throws when every provider fails the check', async () => {
    const pick = rateLimitedPick(async () => false) // nobody passes
    const auditors = [stub('a'), stub('b')]
    await expect(pick(auditors, { url: '/' })).rejects.toThrow(/no auditor passed/i)
  })
})
