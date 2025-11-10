import { createError, defineEventHandler, readBody } from 'h3'
import { getDatabase, schema } from '../../database'
import { generateApiKey } from '../../utils/auth'

/**
 * Create a new user and generate an API key
 * POST /api/users/create
 * {
 *   "email": "user@example.com",
 *   "name": "John Doe"
 * }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body?.email) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email is required',
    })
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(body.email)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid email format',
    })
  }

  const db = await getDatabase()

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, body.email),
  })

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'User with this email already exists',
    })
  }

  // Generate API key
  const apiKey = generateApiKey()

  // Create user
  const [user] = await db.insert(schema.users).values({
    email: body.email,
    name: body.name || null,
    apiKey,
  }).returning()

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    apiKey: user.apiKey,
    createdAt: user.createdAt,
  }
})
