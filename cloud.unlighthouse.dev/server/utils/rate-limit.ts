/**
 * Rate limiting using in-memory store
 * For production with multiple instances, use Redis
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval?: NodeJS.Timeout

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.resetAt) {
          this.store.delete(key)
        }
      }
    }, 60_000)
  }

  /**
   * Check if request is allowed
   * @param key - Unique identifier (IP, API key, etc.)
   * @param limit - Max requests
   * @param windowMs - Time window in milliseconds
   */
  check(key: string, limit: number, windowMs: number): {
    allowed: boolean
    remaining: number
    resetAt: number
  } {
    const now = Date.now()
    const entry = this.store.get(key)

    if (!entry || now > entry.resetAt) {
      // New window
      const resetAt = now + windowMs
      this.store.set(key, { count: 1, resetAt })
      return {
        allowed: true,
        remaining: limit - 1,
        resetAt,
      }
    }

    // Within window
    if (entry.count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      }
    }

    entry.count++
    return {
      allowed: true,
      remaining: limit - entry.count,
      resetAt: entry.resetAt,
    }
  }

  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.store.clear()
  }
}

// Singleton
let rateLimiter: RateLimiter | null = null

export function getRateLimiter(): RateLimiter {
  if (!rateLimiter) {
    rateLimiter = new RateLimiter()
  }
  return rateLimiter
}

/**
 * Rate limit middleware
 */
export function rateLimit(options: {
  limit: number
  windowMs: number
  keyGenerator?: (event: any) => string
}) {
  return defineEventHandler((event) => {
    const limiter = getRateLimiter()

    // Generate key (default: IP address)
    const key = options.keyGenerator
      ? options.keyGenerator(event)
      : getRequestIP(event) || 'unknown'

    const result = limiter.check(key, options.limit, options.windowMs)

    // Set headers
    setHeader(event, 'X-RateLimit-Limit', options.limit.toString())
    setHeader(event, 'X-RateLimit-Remaining', result.remaining.toString())
    setHeader(event, 'X-RateLimit-Reset', result.resetAt.toString())

    if (!result.allowed) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Too many requests, please try again later',
      })
    }
  })
}
