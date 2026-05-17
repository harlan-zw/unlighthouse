// Token-bucket rate limiter Durable Object, keyed per (API key | IP).
// Class form is a Cloudflare Workers platform constraint.

import type { DurableObjectState } from '@cloudflare/workers-types'

interface BucketState {
  tokens: number
  updatedAt: number
}

export interface RateLimiterConfig {
  /** Bucket capacity. */
  capacity: number
  /** Tokens refilled per second. */
  refillPerSec: number
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  capacity: 10,
  refillPerSec: 1,
}

/**
 * Env shape this DO reads at construction. Workers `vars` show up as
 * string-typed bindings on `env`; we coerce + clamp to sane ranges. Any
 * missing / unparseable values fall back to DEFAULT_CONFIG so a fresh
 * deploy without config still rate-limits at the documented 10/sec.
 */
export interface RateLimiterEnv {
  RATE_LIMITER_CAPACITY?: string | number
  RATE_LIMITER_REFILL_PER_SEC?: string | number
}

function resolveConfig(env: unknown): RateLimiterConfig {
  const e = env as RateLimiterEnv
  const capRaw = Number(e?.RATE_LIMITER_CAPACITY ?? DEFAULT_CONFIG.capacity)
  const refillRaw = Number(e?.RATE_LIMITER_REFILL_PER_SEC ?? DEFAULT_CONFIG.refillPerSec)
  return {
    capacity: Number.isFinite(capRaw) && capRaw > 0 ? capRaw : DEFAULT_CONFIG.capacity,
    refillPerSec: Number.isFinite(refillRaw) && refillRaw > 0 ? refillRaw : DEFAULT_CONFIG.refillPerSec,
  }
}

export interface RateLimiterCheckResult {
  ok: boolean
  remaining: number
  resetAt: number
}

export class RateLimiterDO {
  private state: DurableObjectState
  private env: unknown
  private config: RateLimiterConfig

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state
    this.env = env
    // Read RATE_LIMITER_CAPACITY / RATE_LIMITER_REFILL_PER_SEC from the
    // Worker's `vars` block. Unset values fall back to 10 tokens / 1 per
    // sec — same as the prior hardcoded behaviour, just no longer hostile
    // to operators who need to tune.
    this.config = resolveConfig(env)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const key = url.searchParams.get('key') ?? 'anon'
    const cost = Number(url.searchParams.get('cost') ?? '1')
    const result = await this.check(key, cost)
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 429,
      headers: { 'content-type': 'application/json' },
    })
  }

  async check(key: string, cost = 1): Promise<RateLimiterCheckResult> {
    const now = Date.now()
    const stored = (await this.state.storage.get<BucketState>(`b:${key}`)) ?? {
      tokens: this.config.capacity,
      updatedAt: now,
    }

    const elapsedSec = (now - stored.updatedAt) / 1000
    const refilled = Math.min(
      this.config.capacity,
      stored.tokens + elapsedSec * this.config.refillPerSec,
    )

    if (refilled < cost) {
      const deficit = cost - refilled
      const resetAt = now + Math.ceil((deficit / this.config.refillPerSec) * 1000)
      await this.state.storage.put(`b:${key}`, { tokens: refilled, updatedAt: now })
      return { ok: false, remaining: Math.floor(refilled), resetAt }
    }

    const next: BucketState = { tokens: refilled - cost, updatedAt: now }
    await this.state.storage.put(`b:${key}`, next)
    const resetAt = now + Math.ceil(((this.config.capacity - next.tokens) / this.config.refillPerSec) * 1000)
    return { ok: true, remaining: Math.floor(next.tokens), resetAt }
  }
}
