import { afterEach, describe, expect, it, vi } from 'vitest'
import { RateLimiterDO } from '../src/do/rate-limiter'

function createState(): DurableObjectState {
  const values = new Map<string, unknown>()
  // Minimal Workers-runtime shim; this unit only exercises storage.get/put.
  return {
    storage: {
      get: async (key: string) => values.get(key),
      put: async (key: string, value: unknown) => { values.set(key, value) },
    },
  } as unknown as DurableObjectState
}

describe('rate limiter Durable Object', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves partial refill when repeated consumes are denied', async () => {
    const limiter = new RateLimiterDO(createState(), {
      RATE_LIMITER_CAPACITY: 1,
      RATE_LIMITER_REFILL_PER_SEC: 1,
    })
    const now = vi.spyOn(Date, 'now')

    now.mockReturnValue(1_000)
    await expect(limiter.consume('api')).resolves.toMatchObject({ ok: true, remaining: 0, resetAt: 2_000 })

    now.mockReturnValue(1_250)
    await expect(limiter.consume('api')).resolves.toMatchObject({ ok: false, remaining: 0, resetAt: 2_000 })

    now.mockReturnValue(1_500)
    await expect(limiter.consume('api')).resolves.toMatchObject({ ok: false, remaining: 0, resetAt: 2_000 })

    now.mockReturnValue(2_000)
    await expect(limiter.consume('api')).resolves.toMatchObject({ ok: true, remaining: 0 })
  })

  it('reports denied resetAt as the time the requested cost becomes available', async () => {
    const limiter = new RateLimiterDO(createState(), {
      RATE_LIMITER_CAPACITY: 10,
      RATE_LIMITER_REFILL_PER_SEC: 2,
    })
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)

    await limiter.consume('api', 10)
    now.mockReturnValue(2_000)

    await expect(limiter.peek('api', 5)).resolves.toMatchObject({
      ok: false,
      remaining: 2,
      resetAt: 3_500,
    })
  })

  it('rejects invalid costs on the RPC surface', async () => {
    const limiter = new RateLimiterDO(createState(), {})
    await expect(limiter.consume('api', 0)).rejects.toThrow('positive finite number')
    await expect(limiter.peek('api', Number.NaN)).rejects.toThrow('positive finite number')
  })
})
