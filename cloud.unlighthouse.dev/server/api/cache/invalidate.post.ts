import { createError, defineEventHandler, readBody } from 'h3'
import { getResultCache } from '../../app/services/result-cache'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const cache = getResultCache()

  if (body.url) {
    // Invalidate specific URL
    const deleted = cache.invalidateUrl(body.url)
    return {
      success: true,
      message: `Invalidated ${deleted} cache entries for URL: ${body.url}`,
      deleted,
    }
  }
  else if (body.clearAll === true) {
    // Clear entire cache
    cache.clear()
    return {
      success: true,
      message: 'Cleared entire cache',
    }
  }
  else {
    throw createError({
      statusCode: 400,
      statusMessage: 'Must provide either "url" or "clearAll: true"',
    })
  }
})
