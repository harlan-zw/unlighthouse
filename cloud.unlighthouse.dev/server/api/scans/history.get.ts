import { defineEventHandler, getQuery } from 'h3'
import { desc, eq } from 'drizzle-orm'
import { authenticateUser } from '../../utils/auth'
import { getDatabase, schema } from '../../database'

/**
 * Get scan history for authenticated user
 * GET /api/scans/history?limit=50&offset=0&status=completed
 * Headers: Authorization: Bearer <api-key>
 */
export default defineEventHandler(async (event) => {
  const user = await authenticateUser(event)
  const query = getQuery(event)

  const limit = Math.min(Number(query.limit) || 50, 100)
  const offset = Number(query.offset) || 0
  const statusFilter = query.status as string | undefined

  const db = await getDatabase()

  // Build where clause
  const where = statusFilter
    ? (scans, { and, eq }) => and(
        eq(scans.userId, user.id),
        eq(scans.status, statusFilter),
      )
    : (scans, { eq }) => eq(scans.userId, user.id)

  const scans = await db.query.scans.findMany({
    where,
    limit,
    offset,
    orderBy: [desc(schema.scans.createdAt)],
  })

  return {
    scans: scans.map(scan => ({
      id: scan.id,
      url: scan.url,
      categories: JSON.parse(scan.categories),
      formFactor: scan.formFactor,
      throttling: scan.throttling,
      status: scan.status,
      error: scan.error,
      scores: {
        performance: scan.performanceScore,
        accessibility: scan.accessibilityScore,
        bestPractices: scan.bestPracticesScore,
        seo: scan.seoScore,
      },
      cached: Boolean(scan.cached),
      endpoint: scan.endpoint,
      createdAt: scan.createdAt,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
    })),
    pagination: {
      limit,
      offset,
      total: scans.length,
    },
  }
})
