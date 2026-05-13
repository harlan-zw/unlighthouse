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
    // TODO(v5): pull from env / inline config rather than hard-coding.
    this.config = DEFAULT_CONFIG
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
