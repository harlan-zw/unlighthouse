import { createError, defineEventHandler, readBody } from 'h3'
import { createBrowserlessAuditor } from '../app/auditors/browserless'
import {
  createPendingScan,
  markScanCached,
  markScanCompleted,
  markScanFailed,
  markScanProcessing,
} from '../app/lib/scan-record'
import { parseScanRequest } from '../app/lib/scan-request'
import { getBrowserlessLimiter } from '../app/services/browserless-limiter'
import { getResultCache } from '../app/services/result-cache'
import { authenticateUser } from '../utils/auth'
import { rateLimit } from '../utils/rate-limit'

/**
 * Scan endpoint using Browserless.io managed browser service.
 * Requires authentication via API key. Saves results to DB for history. Rate limited per user.
 *
 * POST /api/scan-browserless
 * Headers: Authorization: Bearer <api-key>
 */
const auditor = createBrowserlessAuditor()

export default defineEventHandler(async (event) => {
  const user = await authenticateUser(event)

  await rateLimit({
    limit: 100,
    windowMs: 60 * 60 * 1000,
    keyGenerator: () => `scan:${user.id}`,
  })(event)

  const scanOptions = parseScanRequest(await readBody(event))
  const cache = getResultCache()
  const scan = await createPendingScan({ userId: user.id, options: scanOptions, endpoint: 'browserless' })

  if (scanOptions.useCache) {
    const cached = cache.get(scanOptions)
    if (cached) {
      await markScanCached(scan.id, cached)
      return { ...cached, cached: true, scanId: scan.id }
    }
  }

  try {
    const result = await getBrowserlessLimiter().run(async () => {
      await markScanProcessing(scan.id)
      return await auditor.audit(scanOptions)
    })
    await markScanCompleted(scan.id, result)
    if (scanOptions.useCache) {
      cache.set(scanOptions, result)
    }
    return { ...result, scanId: scan.id }
  }
  catch (e: any) {
    await markScanFailed(scan.id, e.message || 'Unknown error')
    if (e.statusCode)
      throw e
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to run lighthouse scan: ${e.message}`,
    })
  }
})
