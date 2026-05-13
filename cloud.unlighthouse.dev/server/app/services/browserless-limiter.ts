import type { Limiter } from '../lib/limiter'
import { createLimiter } from '../lib/limiter'

let limiter: Limiter | null = null

export function getBrowserlessLimiter(): Limiter {
  if (!limiter) {
    // Higher concurrency OK for Browserless since they handle the actual browsers;
    // this just prevents overwhelming their API.
    limiter = createLimiter(10)
  }
  return limiter
}
