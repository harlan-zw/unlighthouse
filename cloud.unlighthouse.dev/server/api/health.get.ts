import { defineEventHandler } from 'h3'
import { getChromePool } from '../app/services/chrome-pool'
import { getScanQueue } from '../app/services/scan-queue'

export default defineEventHandler(async () => {
  const queue = getScanQueue()
  const pool = getChromePool()

  const queueStats = queue.getStats()
  const poolStats = pool.getStats()

  const isHealthy = poolStats.total > 0 && poolStats.total <= poolStats.maxInstances

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks: {
      chromePool: {
        status: poolStats.total > 0 ? 'pass' : 'fail',
        instances: poolStats.total,
      },
      queue: {
        status: 'pass',
        size: queueStats.queued,
        processing: queueStats.processing,
      },
    },
  }
})
