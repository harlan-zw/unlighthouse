// RateLimiter port (D-036) — the unstorage adapter's check/consume/remaining
// semantics, plus permissive behaviour for unconfigured buckets. Deterministic
// via an injected clock.

import { createUnstorageRateLimiter } from '@unlighthouse/core/auditors/route'
import { describe, expect, it } from 'vitest'

describe('createUnstorageRateLimiter', () => {
  it('check does not consume; consume decrements', async () => {
    let t = 0
    const rl = createUnstorageRateLimiter({
      rules: { psi: { capacity: 2, refillPerSec: 0 } },
      now: () => t,
    })

    // Repeated checks never drain the bucket.
    expect((await rl.check('psi')).allowed).toBe(true)
    expect((await rl.check('psi')).allowed).toBe(true)
    expect((await rl.remaining('psi'))?.remaining).toBe(2)

    await rl.consume('psi')
    expect((await rl.remaining('psi'))?.remaining).toBe(1)
    await rl.consume('psi')
    expect((await rl.remaining('psi'))?.remaining).toBe(0)
    expect((await rl.check('psi')).allowed).toBe(false)
  })

  it('refills continuously by elapsed wall time', async () => {
    let t = 0
    const rl = createUnstorageRateLimiter({
      rules: { psi: { capacity: 2, refillPerSec: 2 } },
      now: () => t,
    })
    await rl.consume('psi', 2)
    expect((await rl.check('psi')).allowed).toBe(false)
    t += 500 // 0.5s * 2/s = 1 token
    expect((await rl.remaining('psi'))?.remaining).toBe(1)
    expect((await rl.check('psi')).allowed).toBe(true)
    t += 2000 // caps at capacity
    expect((await rl.remaining('psi'))?.remaining).toBe(2)
  })

  it('is permissive for unconfigured buckets', async () => {
    const rl = createUnstorageRateLimiter({ rules: { psi: { capacity: 1, refillPerSec: 0 } } })
    // No rule for `local` → always allowed, consume is a no-op, remaining is null.
    for (let i = 0; i < 50; i++) {
      expect((await rl.check('local')).allowed).toBe(true)
      await rl.consume('local')
    }
    expect(await rl.remaining('local')).toBeNull()
    // psi still enforced.
    await rl.consume('psi')
    expect((await rl.check('psi')).allowed).toBe(false)
  })

  it('remaining reports limit and floored remaining', async () => {
    const rl = createUnstorageRateLimiter({ rules: { psi: { capacity: 25000, refillPerSec: 0 } } })
    await rl.consume('psi', 12569)
    const state = await rl.remaining('psi')
    expect(state).toMatchObject({ remaining: 12431, limit: 25000 })
    expect(typeof state?.resetAt).toBe('number')
  })
})
