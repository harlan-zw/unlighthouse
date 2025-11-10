import { defineEventHandler } from 'h3'
import { getBrowserlessQueue } from '../app/services/browserless-queue'
import { getResultCache } from '../app/services/result-cache'

/**
 * Get metrics for the Browserless endpoint
 * Tracks queue stats and cache performance
 */
export default defineEventHandler(async () => {
  const queue = getBrowserlessQueue()
  const cache = getResultCache()

  return {
    timestamp: new Date().toISOString(),
    queue: queue.getStats(),
    cache: cache.getStats(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  }
})
