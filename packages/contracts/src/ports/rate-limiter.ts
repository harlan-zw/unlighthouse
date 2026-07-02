// RateLimiter port (D-036).
//
// Promoted from a deferred hook-bus shape once two real adapters existed:
// the unstorage counter in the CLI (`core/rate-limiters/unstorage`) and
// Cloudflare's `RateLimiterDO` client wrapper. Spec pinned in v1.md
// §"RateLimiter (deferred — hook-bus shape, not a v1 port)".
//
// `check` peeks at a bucket without consuming; `consume` decrements it;
// `remaining` is dashboard-surfaceable (UI shows "PSI quota: 12,431 /
// 25,000 today"). Buckets are addressed by an opaque string (e.g. `psi`,
// `psi:user-123`); an unconfigured bucket is permissive — `check` allows,
// `consume` is a no-op, `remaining` returns `null` (no limit to report).

export interface RateLimiterCheck {
  /** Whether the bucket currently has capacity for one operation. */
  allowed: boolean
  /** Epoch ms when the bucket next refills to capacity, if known. */
  resetAt?: number
}

export interface RateLimiterRemaining {
  /** Whole operations remaining before the bucket is exhausted. */
  remaining: number
  /** Bucket capacity (the denominator in a "12,431 / 25,000" readout). */
  limit: number
  /** Epoch ms when the bucket next refills to capacity. */
  resetAt: number
}

export interface RateLimiter {
  check: (bucket: string) => Promise<RateLimiterCheck>
  consume: (bucket: string, n?: number) => Promise<void>
  remaining: (bucket: string) => Promise<RateLimiterRemaining | null>
}
