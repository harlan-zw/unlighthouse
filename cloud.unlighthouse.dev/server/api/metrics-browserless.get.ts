import { defineEventHandler } from 'h3'
import { getBrowserlessLimiter } from '../app/services/browserless-limiter'
import { getResultCache } from '../app/services/result-cache'

/**
 * Get metrics for the Browserless endpoint
 * Tracks limiter stats and cache performance
 */
export default defineEventHandler(async () => {
  return {
    timestamp: new Date().toISOString(),
    limiter: getBrowserlessLimiter().getStats(),
    cache: getResultCache().getStats(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  }
})
