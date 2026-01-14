import type { LighthouseScanOptions } from '../app/services/lighthouse'
import { createError, defineEventHandler, readBody } from 'h3'
import { runLighthouseScan } from '../app/services/lighthouse'
import { getResultCache } from '../app/services/result-cache'
import { getScanQueue } from '../app/services/scan-queue'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || !body.url) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required field: url',
    })
  }

  // Validate categories if provided
  const validCategories = ['performance', 'accessibility', 'best-practices', 'seo', 'pwa']
  if (body.categories && Array.isArray(body.categories)) {
    for (const category of body.categories) {
      if (!validCategories.includes(category)) {
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid category: ${category}. Valid categories are: ${validCategories.join(', ')}`,
        })
      }
    }
  }

  // Validate formFactor if provided
  if (body.formFactor && !['mobile', 'desktop'].includes(body.formFactor)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid formFactor. Must be "mobile" or "desktop"',
    })
  }

  // Validate throttling if provided
  if (body.throttling && !['mobile3G', 'mobile4G', 'none'].includes(body.throttling)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid throttling. Must be "mobile3G", "mobile4G", or "none"',
    })
  }

  const scanOptions: LighthouseScanOptions = {
    url: body.url,
    categories: body.categories,
    formFactor: body.formFactor,
    throttling: body.throttling,
    useCache: body.useCache !== false, // Default to true
  }

  // Check cache first if enabled
  if (scanOptions.useCache) {
    const cache = getResultCache()
    const cached = cache.get(scanOptions)
    if (cached) {
      return {
        ...cached,
        cached: true,
      }
    }
  }

  // Add to queue and wait for result
  const queue = getScanQueue()

  try {
    // Enqueue the scan
    const scan = await queue.enqueue(scanOptions)

    // Start processing it
    queue.startProcessing(scan.id)

    // Run the actual scan
    let result
    try {
      result = await runLighthouseScan(scanOptions)

      // Cache the result if caching is enabled
      if (scanOptions.useCache) {
        const cache = getResultCache()
        cache.set(scanOptions, result)
      }

      // Mark as completed
      queue.completeScan(scan.id, result)

      return result
    }
    catch (e: any) {
      // Mark as failed
      queue.failScan(scan.id, e.message || 'Scan failed')
      throw e
    }
  }
  catch (e: any) {
    // If it's already a createError, re-throw it
    if (e.statusCode) {
      throw e
    }

    // Otherwise, wrap it
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to run lighthouse scan: ${e.message}`,
    })
  }
})
