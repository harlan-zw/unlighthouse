import { defineEventHandler } from 'h3'
import { authenticateUser } from '../../utils/auth'

/**
 * Get current user info
 * GET /api/users/me
 * Headers: Authorization: Bearer <api-key>
 */
export default defineEventHandler(async (event) => {
  const user = await authenticateUser(event)

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }
})
