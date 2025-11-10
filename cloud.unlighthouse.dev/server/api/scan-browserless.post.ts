import { createError, defineEventHandler, readBody } from 'h3'
import type { LighthouseScanOptions } from '../app/services/lighthouse'
import { runLighthouseScanViaBrowserless } from '../app/services/lighthouse-browserless'
import { getResultCache } from '../app/services/result-cache'
import { getBrowserlessQueue } from '../app/services/browserless-queue'

/**
 * Scan endpoint using Browserless.io managed browser service.
 * Includes lightweight queuing for rate limiting and cost management.
 *
 * POST /api/scan-browserless
 * {
 *   "url": "https://example.com",
 *   "categories": ["performance", "accessibility"],
 *   "formFactor": "mobile",
 *   "throttling": "mobile4G",
 *   "useCache": true
 * }
 */
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

  // Use lightweight queue to rate-limit requests to Browserless
  const queue = getBrowserlessQueue()

  // Wait for queue capacity if needed
  while (!queue.canProcess()) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const queueId = await queue.enqueue(scanOptions)
  const item = queue.dequeue()

  if (!item) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Queue is full, please try again later',
    })
  }

  try {
    // Run scan via Browserless
    const result = await runLighthouseScanViaBrowserless(scanOptions)

    // Mark as completed
    queue.complete(queueId)

    // Cache the result if caching is enabled
    if (scanOptions.useCache) {
      const cache = getResultCache()
      cache.set(scanOptions, result)
    }

    return result
  }
  catch (e: any) {
    // Mark as failed
    queue.fail(queueId, e.message || 'Unknown error')

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
