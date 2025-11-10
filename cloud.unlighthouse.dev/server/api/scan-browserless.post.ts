import { createError, defineEventHandler, readBody } from 'h3'
import type { LighthouseScanOptions } from '../app/services/lighthouse'
import { runLighthouseScanViaBrowserless } from '../app/services/lighthouse-browserless'
import { getResultCache } from '../app/services/result-cache'
import { getBrowserlessQueue } from '../app/services/browserless-queue'
import { authenticateUser } from '../utils/auth'
import { getDatabase, schema } from '../database'
import { rateLimit } from '../utils/rate-limit'

/**
 * Scan endpoint using Browserless.io managed browser service.
 * Requires authentication via API key.
 * Saves scan results to database for history tracking.
 * Rate limited per user to prevent abuse.
 *
 * POST /api/scan-browserless
 * Headers: Authorization: Bearer <api-key>
 * Body: {
 *   "url": "https://example.com",
 *   "categories": ["performance", "accessibility"],
 *   "formFactor": "mobile",
 *   "throttling": "mobile4G",
 *   "useCache": true
 * }
 */
export default defineEventHandler(async (event) => {
  // Authenticate user first
  const user = await authenticateUser(event)

  // Rate limit: 100 scans per hour per user
  await rateLimit({
    limit: 100,
    windowMs: 60 * 60 * 1000,
    keyGenerator: () => `scan:${user.id}`,
  })(event)
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

  const db = await getDatabase()

  // Create scan record
  const [scan] = await db.insert(schema.scans).values({
    userId: user.id,
    url: scanOptions.url,
    categories: JSON.stringify(scanOptions.categories || ['performance', 'accessibility', 'best-practices', 'seo']),
    formFactor: scanOptions.formFactor || 'mobile',
    throttling: scanOptions.throttling || 'mobile4G',
    status: 'queued',
    endpoint: 'browserless',
  }).returning()

  // Check cache first if enabled
  if (scanOptions.useCache) {
    const cache = getResultCache()
    const cached = cache.get(scanOptions)
    if (cached) {
      // Update scan record as cached
      await db.update(schema.scans)
        .set({
          status: 'cached',
          cached: true,
          result: JSON.stringify(cached),
          performanceScore: Math.round((cached.categories.performance?.score || 0) * 100),
          accessibilityScore: Math.round((cached.categories.accessibility?.score || 0) * 100),
          bestPracticesScore: Math.round((cached.categories['best-practices']?.score || 0) * 100),
          seoScore: Math.round((cached.categories.seo?.score || 0) * 100),
          completedAt: new Date(),
        })
        .where((scans, { eq }) => eq(scans.id, scan.id))

      return {
        ...cached,
        cached: true,
        scanId: scan.id,
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
    // Mark scan as failed
    await db.update(schema.scans)
      .set({
        status: 'failed',
        error: 'Queue is full',
        completedAt: new Date(),
      })
      .where((scans, { eq }) => eq(scans.id, scan.id))

    throw createError({
      statusCode: 503,
      statusMessage: 'Queue is full, please try again later',
    })
  }

  // Update scan as processing
  await db.update(schema.scans)
    .set({
      status: 'processing',
      startedAt: new Date(),
    })
    .where((scans, { eq }) => eq(scans.id, scan.id))

  try {
    // Run scan via Browserless
    const result = await runLighthouseScanViaBrowserless(scanOptions)

    // Mark as completed
    queue.complete(queueId)

    // Update scan record with results
    await db.update(schema.scans)
      .set({
        status: 'completed',
        result: JSON.stringify(result),
        fetchTime: result.fetchTime,
        performanceScore: Math.round((result.categories.performance?.score || 0) * 100),
        accessibilityScore: Math.round((result.categories.accessibility?.score || 0) * 100),
        bestPracticesScore: Math.round((result.categories['best-practices']?.score || 0) * 100),
        seoScore: Math.round((result.categories.seo?.score || 0) * 100),
        completedAt: new Date(),
      })
      .where((scans, { eq }) => eq(scans.id, scan.id))

    // Cache the result if caching is enabled
    if (scanOptions.useCache) {
      const cache = getResultCache()
      cache.set(scanOptions, result)
    }

    return {
      ...result,
      scanId: scan.id,
    }
  }
  catch (e: any) {
    // Mark as failed
    queue.fail(queueId, e.message || 'Unknown error')

    // Update scan record as failed
    await db.update(schema.scans)
      .set({
        status: 'failed',
        error: e.message || 'Unknown error',
        completedAt: new Date(),
      })
      .where((scans, { eq }) => eq(scans.id, scan.id))

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
