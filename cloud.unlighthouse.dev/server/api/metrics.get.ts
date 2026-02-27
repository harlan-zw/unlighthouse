import { defineEventHandler } from 'h3'
import { getChromePool } from '../app/services/chrome-pool'
import { getResultCache } from '../app/services/result-cache'
import { getScanQueue } from '../app/services/scan-queue'

export default defineEventHandler(async () => {
  const queue = getScanQueue()
  const cache = getResultCache()
  const pool = getChromePool()

  return {
    timestamp: new Date().toISOString(),
    queue: queue.getStats(),
    cache: cache.getStats(),
    chromePool: pool.getStats(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
  }
})
