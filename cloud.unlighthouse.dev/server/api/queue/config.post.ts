import { createError, defineEventHandler, readBody } from 'h3'
import { getScanQueue } from '../../app/services/scan-queue'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body.maxConcurrency || typeof body.maxConcurrency !== 'number') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must provide maxConcurrency as a number',
    })
  }

  if (body.maxConcurrency < 1 || body.maxConcurrency > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'maxConcurrency must be between 1 and 10',
    })
  }

  const queue = getScanQueue()
  queue.setMaxConcurrency(body.maxConcurrency)

  return {
    success: true,
    message: `Updated maxConcurrency to ${body.maxConcurrency}`,
    stats: queue.getStats(),
  }
})
