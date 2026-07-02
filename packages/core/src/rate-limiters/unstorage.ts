// Unstorage-backed RateLimiter adapter (D-036).
//
// Token-bucket semantics (matches the `RateRule` config the router already
// speaks) persisted through any unstorage backend — memory (default), KV,
// R2, Redis, etc. One key per bucket name. Tokens refill continuously at
// `refillPerSec`, computed lazily on each access so there is no timer.
//
// Buckets without a declared rule are permissive: `check` allows, `consume`
// is a no-op, `remaining` reports `null` (nothing to limit). This preserves
// the historical "unconfigured provider always passes" behaviour the
// `rate-limited` router strategy relies on.

import type { RateLimiter } from '@unlighthouse/contracts/ports'
import type { Storage } from 'unstorage'
import type { RateRule } from '../auditors/route/token-bucket'
import { createStorage } from 'unstorage'

interface PersistedBucket {
  tokens: number
  lastRefillMs: number
}

export interface UnstorageRateLimiterOptions {
  /** Per-bucket token-bucket rules. Buckets absent from this map are permissive. */
  rules?: Record<string, RateRule>
  /** unstorage instance for persistence; defaults to an in-memory store. */
  storage?: Storage<PersistedBucket>
  /** Injectable clock (ms) for deterministic tests. */
  now?: () => number
}

function refill(rule: RateRule, state: PersistedBucket, nowMs: number): PersistedBucket {
  const elapsed = nowMs - state.lastRefillMs
  if (elapsed <= 0)
    return state
  const added = elapsed * (rule.refillPerSec / 1000)
  if (added <= 0)
    return state
  return { tokens: Math.min(rule.capacity, state.tokens + added), lastRefillMs: nowMs }
}

/**
 * Build a {@link RateLimiter} backed by unstorage using token-bucket
 * refill semantics, keyed by bucket name.
 */
export function createUnstorageRateLimiter(opts: UnstorageRateLimiterOptions = {}): RateLimiter {
  const rules = opts.rules ?? {}
  const storage: Storage<PersistedBucket> = opts.storage ?? createStorage<PersistedBucket>()
  const now = opts.now ?? Date.now

  async function loadRefilled(bucket: string, rule: RateRule): Promise<PersistedBucket> {
    const stored = await storage.getItem(bucket)
    const state = stored ?? { tokens: rule.capacity, lastRefillMs: now() }
    return refill(rule, state, now())
  }

  function resetAtFor(rule: RateRule, tokens: number): number {
    const deficit = rule.capacity - tokens
    const ms = rule.refillPerSec > 0 ? Math.ceil((deficit / rule.refillPerSec) * 1000) : 0
    return now() + ms
  }

  return {
    async check(bucket) {
      const rule = rules[bucket]
      if (!rule)
        return { allowed: true } // permissive: unconfigured bucket
      const state = await loadRefilled(bucket, rule)
      // Persist the refill so `lastRefillMs` advances; no consumption here.
      await storage.setItem(bucket, state)
      return { allowed: state.tokens >= 1, resetAt: resetAtFor(rule, state.tokens) }
    },
    async consume(bucket, n = 1) {
      const rule = rules[bucket]
      if (!rule)
        return // permissive: nothing to consume
      const state = await loadRefilled(bucket, rule)
      await storage.setItem(bucket, { tokens: Math.max(0, state.tokens - n), lastRefillMs: state.lastRefillMs })
    },
    async remaining(bucket) {
      const rule = rules[bucket]
      if (!rule)
        return null // unconfigured bucket has no limit to report
      const state = await loadRefilled(bucket, rule)
      return { remaining: Math.floor(state.tokens), limit: rule.capacity, resetAt: resetAtFor(rule, state.tokens) }
    },
  }
}
