import { and, eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getDatabase, schema } from '../../database'
import { authenticateUser } from '../../utils/auth'

/**
 * Get a specific scan result by ID
 * GET /api/scans/:id
 * Headers: Authorization: Bearer <api-key>
 */
export default defineEventHandler(async (event) => {
  const user = await authenticateUser(event)
  const scanId = Number(getRouterParam(event, 'id'))

  if (!scanId || Number.isNaN(scanId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid scan ID',
    })
  }

  const db = await getDatabase()

  const scan = await db.query.scans.findFirst({
    where: and(
      eq(schema.scans.id, scanId),
      eq(schema.scans.userId, user.id),
    ),
  })

  if (!scan) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Scan not found',
    })
  }

  return {
    id: scan.id,
    url: scan.url,
    categories: JSON.parse(scan.categories),
    formFactor: scan.formFactor,
    throttling: scan.throttling,
    status: scan.status,
    error: scan.error,
    result: scan.result ? JSON.parse(scan.result) : null,
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
    fetchTime: scan.fetchTime,
  }
})
