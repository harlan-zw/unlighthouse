import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'
import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../database'

/**
 * Extract API key from request headers
 */
export function getApiKey(event: H3Event): string | null {
  // Support both Authorization: Bearer <key> and X-API-Key: <key>
  const authHeader = getHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return getHeader(event, 'x-api-key') || null
}

/**
 * Authenticate user by API key
 * Returns the user object or throws error
 */
export async function authenticateUser(event: H3Event) {
  const apiKey = getApiKey(event)

  if (!apiKey) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Missing API key. Provide via Authorization: Bearer <key> or X-API-Key: <key> header',
    })
  }

  const db = await getDatabase()
  const user = await db.query.users.findFirst({
    where: eq(schema.users.apiKey, apiKey),
  })

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid API key',
    })
  }

  return user
}

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const length = 32
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `lh_${result}`
}
