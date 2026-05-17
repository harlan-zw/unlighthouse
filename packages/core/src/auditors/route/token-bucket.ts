// Token-bucket rate limiter for AuditorRouter `rate-limited` strategy.
// One bucket per provider name. `try()` consumes a token if one is
// available (returns true) and refuses without blocking (returns false)
// — the router treats false as "skip this provider, try the next one."
//
// Tokens refill at `refillPerSec` continuously (computed lazily on each
// access, so no setInterval / no timer leak). `capacity` is the hard cap.
//
// Intentionally simple: no jitter, no burst smoothing, no async waits.
// Callers that need a real queue layer on top should compose this with
// a separate scheduler — the router only needs "can I burn one now?"
// semantics.

export interface RateRule {
  capacity: number
  refillPerSec: number
}

interface Bucket {
  tokens: number
  lastRefillMs: number
  cap: number
  perMs: number // refillPerSec / 1000
}

export interface TokenBucket {
  /** Attempt to consume one token; returns true on success. */
  try: (name: string) => boolean
  /** Read-only token count for tests / observability. */
  tokensFor: (name: string) => number | null
}

/**
 * Build a token-bucket store keyed by provider name. Providers without a
 * declared rule get an "infinite" bucket — `try()` always returns true so
 * unconfigured providers fall back to the historical permissive behaviour.
 */
export function createTokenBucket(rules: Record<string, RateRule> = {}, now: () => number = Date.now): TokenBucket {
  const buckets = new Map<string, Bucket>()

  function ensure(name: string): Bucket | null {
    const rule = rules[name]
    if (!rule)
      return null // unconfigured → permissive
    let b = buckets.get(name)
    if (!b) {
      b = {
        tokens: rule.capacity,
        lastRefillMs: now(),
        cap: rule.capacity,
        perMs: rule.refillPerSec / 1000,
      }
      buckets.set(name, b)
    }
    return b
  }

  function refill(b: Bucket): void {
    const t = now()
    const elapsed = t - b.lastRefillMs
    if (elapsed <= 0)
      return
    const added = elapsed * b.perMs
    if (added <= 0)
      return
    b.tokens = Math.min(b.cap, b.tokens + added)
    b.lastRefillMs = t
  }

  return {
    try(name) {
      const b = ensure(name)
      if (!b)
        return true // permissive for unconfigured providers
      refill(b)
      if (b.tokens >= 1) {
        b.tokens -= 1
        return true
      }
      return false
    },
    tokensFor(name) {
      const b = buckets.get(name)
      if (!b)
        return null
      refill(b)
      return b.tokens
    },
  }
}
