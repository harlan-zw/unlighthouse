// Token-bucket rate limiter Durable Object, keyed per (API key | IP).
// Class form is a Cloudflare Workers platform constraint.
//
// The DO is the server; `createRateLimiterClient` is the `RateLimiter` port
// adapter (D-036) the Worker's `rateLimitedPick` consumes. One DO per quota
// bucket (`idFromName(bucket)`); `check` peeks, `consume` decrements,
// `remaining` reads — dispatched over `fetch` via the `op` query param.

import type { RateLimiter } from '@unlighthouse/contracts/ports'
import { DurableObject } from 'cloudflare:workers'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveConfig(env: unknown): RateLimiterConfig {
  const e = isRecord(env) ? env : {}
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
  limit: number
  resetAt: number
}

function isRateLimiterCheckResult(value: unknown): value is RateLimiterCheckResult {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && typeof value.ok === 'boolean'
    && 'remaining' in value
    && typeof value.remaining === 'number'
    && 'limit' in value
    && typeof value.limit === 'number'
    && 'resetAt' in value
    && typeof value.resetAt === 'number'
}

export class RateLimiterDO extends DurableObject<RateLimiterEnv> {
  private state: DurableObjectState
  private config: RateLimiterConfig

  constructor(state: DurableObjectState, env: RateLimiterEnv) {
    super(state, env)
    this.state = state
    // Read RATE_LIMITER_CAPACITY / RATE_LIMITER_REFILL_PER_SEC from the
    // Worker's `vars` block. Unset values fall back to 10 tokens / 1 per
    // sec — same as the prior hardcoded behaviour, just no longer hostile
    // to operators who need to tune.
    this.config = resolveConfig(env)
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const key = url.searchParams.get('key') ?? 'anon'
    const cost = Number(url.searchParams.get('cost') ?? '1')
    const op = url.searchParams.get('op') ?? 'consume'
    if (!Number.isFinite(cost) || cost <= 0) {
      return new Response(JSON.stringify({ error: 'cost must be a positive finite number' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    }
    const result = op === 'check'
      ? await this.peek(key, cost)
      : op === 'remaining'
        ? await this.readRemaining(key)
        : await this.consume(key, cost)
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 429,
      headers: { 'content-type': 'application/json' },
    })
  }

  private async refilled(key: string, now: number): Promise<number> {
    const stored = (await this.state.storage.get<BucketState>(`b:${key}`)) ?? {
      tokens: this.config.capacity,
      updatedAt: now,
    }
    const elapsedSec = (now - stored.updatedAt) / 1000
    return Math.min(this.config.capacity, stored.tokens + elapsedSec * this.config.refillPerSec)
  }

  private resetAt(tokens: number, now: number, target: number): number {
    const deficit = Math.max(0, target - tokens)
    return now + Math.ceil((deficit / this.config.refillPerSec) * 1000)
  }

  private assertCost(cost: number): void {
    if (!Number.isFinite(cost) || cost <= 0)
      throw new RangeError('cost must be a positive finite number')
  }

  /** Peek at a bucket without consuming; persists the refill only. */
  async peek(key: string, cost = 1): Promise<RateLimiterCheckResult> {
    this.assertCost(cost)
    const now = Date.now()
    const tokens = await this.refilled(key, now)
    await this.state.storage.put(`b:${key}`, { tokens, updatedAt: now })
    return { ok: tokens >= cost, remaining: Math.floor(tokens), limit: this.config.capacity, resetAt: this.resetAt(tokens, now, cost) }
  }

  /** Consume `cost` tokens when available and report the outcome. */
  async consume(key: string, cost = 1): Promise<RateLimiterCheckResult> {
    this.assertCost(cost)
    const now = Date.now()
    const tokens = await this.refilled(key, now)
    const ok = tokens >= cost
    // A denied request must not erase a partial refill. Otherwise a caller
    // polling faster than the refill rate can keep the bucket empty forever.
    const next = ok ? tokens - cost : tokens
    await this.state.storage.put(`b:${key}`, { tokens: next, updatedAt: now })
    return { ok, remaining: Math.floor(next), limit: this.config.capacity, resetAt: this.resetAt(next, now, cost) }
  }

  /** Read the current bucket state without consuming or persisting. */
  async readRemaining(key: string): Promise<RateLimiterCheckResult> {
    const now = Date.now()
    const tokens = await this.refilled(key, now)
    return { ok: tokens >= 1, remaining: Math.floor(tokens), limit: this.config.capacity, resetAt: this.resetAt(tokens, now, this.config.capacity) }
  }
}

/**
 * `RateLimiter` port adapter over a `RateLimiterDO` namespace binding. Each
 * bucket name maps to its own DO (`idFromName(bucket)`); the port methods are
 * RPC calls dispatched via the DO's `fetch` `op` param.
 */
export function createRateLimiterClient(namespace: DurableObjectNamespace): RateLimiter {
  const stubFor = (bucket: string) => namespace.get(namespace.idFromName(bucket))

  async function call(bucket: string, op: string, cost?: number): Promise<RateLimiterCheckResult> {
    const params = new URLSearchParams({ key: bucket, op })
    if (cost != null)
      params.set('cost', String(cost))
    const res = await stubFor(bucket).fetch(`https://rate-limiter/?${params.toString()}`)
    const value: unknown = await res.json()
    if (!isRateLimiterCheckResult(value))
      throw new TypeError('Rate limiter Durable Object returned an invalid response.')
    return value
  }

  return {
    async check(bucket) {
      const r = await call(bucket, 'check')
      return { allowed: r.ok, resetAt: r.resetAt }
    },
    async consume(bucket, n = 1) {
      await call(bucket, 'consume', n)
    },
    async remaining(bucket) {
      const r = await call(bucket, 'remaining')
      return { remaining: r.remaining, limit: r.limit, resetAt: r.resetAt }
    },
  }
}
