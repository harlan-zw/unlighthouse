import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Scans table - stores scan session metadata
 */
export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(), // UUID
  site: text('site').notNull(),
  device: text('device', { enum: ['mobile', 'desktop'] }).notNull().default('mobile'),
  throttle: integer('throttle', { mode: 'boolean' }).notNull().default(false),

  // Progress
  routeCount: integer('route_count').notNull().default(0),
  scannedCount: integer('scanned_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),

  // Aggregate scores (0-100)
  avgScore: integer('avg_score'),
  performanceScore: integer('performance_score'),
  accessibilityScore: integer('accessibility_score'),
  bestPracticesScore: integer('best_practices_score'),
  seoScore: integer('seo_score'),

  // Status
  status: text('status', { enum: ['running', 'complete', 'cancelled', 'failed'] }).notNull().default('running'),
  error: text('error'),

  // Paths
  reportPath: text('report_path').notNull(), // Path to reports directory

  // Timestamps
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

/**
 * Scan routes table - stores individual route results within a scan
 */
export const scanRoutes = sqliteTable('scan_routes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),

  // Route info
  path: text('path').notNull(),
  url: text('url').notNull(),

  // Scores (0-100)
  score: integer('score'),
  performanceScore: integer('performance_score'),
  accessibilityScore: integer('accessibility_score'),
  bestPracticesScore: integer('best_practices_score'),
  seoScore: integer('seo_score'),

  // Status
  status: text('status', { enum: ['pending', 'scanning', 'complete', 'failed'] }).notNull().default('pending'),

  // Timestamps
  scannedAt: integer('scanned_at', { mode: 'timestamp' }),
})

// Type exports
export type Scan = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
export type ScanRoute = typeof scanRoutes.$inferSelect
export type NewScanRoute = typeof scanRoutes.$inferInsert
