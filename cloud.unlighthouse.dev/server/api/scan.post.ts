import { createError, defineEventHandler, readBody } from 'h3'
import { createLocalChromeAuditor } from '../app/auditors/local-chrome'
import { parseScanRequest } from '../app/lib/scan-request'
import { getResultCache } from '../app/services/result-cache'
import { getScanQueue } from '../app/services/scan-queue'

const auditor = createLocalChromeAuditor()

export default defineEventHandler(async (event) => {
  const scanOptions = parseScanRequest(await readBody(event))
  const cache = getResultCache()

  if (scanOptions.useCache) {
    const cached = cache.get(scanOptions)
    if (cached) {
      return { ...cached, cached: true }
    }
  }

  const queue = getScanQueue()
  const scan = await queue.enqueue(scanOptions)
  queue.startProcessing(scan.id)

  try {
    const result = await auditor.audit(scanOptions)
    if (scanOptions.useCache) {
      cache.set(scanOptions, result)
    }
    queue.completeScan(scan.id, result)
    return result
  }
  catch (e: any) {
    queue.failScan(scan.id, e.message || 'Scan failed')
    if (e.statusCode)
      throw e
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to run lighthouse scan: ${e.message}`,
    })
  }
})
