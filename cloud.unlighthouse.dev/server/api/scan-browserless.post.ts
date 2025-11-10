import { createError, defineEventHandler, readBody } from 'h3'
import type { LighthouseScanOptions } from '../app/services/lighthouse'
import { runLighthouseScanViaBrowserless } from '../app/services/lighthouse-browserless'
import { getResultCache } from '../app/services/result-cache'

/**
 * Alternative scan endpoint using Browserless.io managed browser service.
 * This is simpler and more scalable than self-hosting Chrome instances.
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

  try {
    // Run scan via Browserless (no queue needed - they handle it)
    const result = await runLighthouseScanViaBrowserless(scanOptions)

    // Cache the result if caching is enabled
    if (scanOptions.useCache) {
      const cache = getResultCache()
      cache.set(scanOptions, result)
    }

    return result
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
