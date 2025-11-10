import { createError, defineEventHandler, readBody } from 'h3'
import { getBrowserlessQueue } from '../../app/services/browserless-queue'

/**
 * Configure the Browserless queue concurrency
 * Higher values = more concurrent requests to Browserless API
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.maxConcurrency || typeof body.maxConcurrency !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must provide maxConcurrency as a number',
    })
  }

  if (body.maxConcurrency < 1 || body.maxConcurrency > 50) {
    throw createError({
      statusCode: 400,
      statusMessage: 'maxConcurrency must be between 1 and 50',
    })
  }

  const queue = getBrowserlessQueue()
  queue.setMaxConcurrent(body.maxConcurrency)

  return {
    success: true,
    message: `Updated Browserless queue maxConcurrency to ${body.maxConcurrency}`,
    stats: queue.getStats(),
  }
})
