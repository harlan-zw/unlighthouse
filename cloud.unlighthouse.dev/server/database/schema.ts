import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Users table - stores API users who can run scans
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  apiKey: text('api_key').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

/**
 * Scans table - stores Lighthouse scan results with user association
 */
export const scans = sqliteTable('scans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Scan request details
  url: text('url').notNull(),
  categories: text('categories').notNull(), // JSON array as string
  formFactor: text('form_factor', { enum: ['mobile', 'desktop'] }).notNull().default('mobile'),
  throttling: text('throttling', { enum: ['mobile3G', 'mobile4G', 'none'] }).notNull().default('mobile4G'),

  // Scan status
  status: text('status', { enum: ['queued', 'processing', 'completed', 'failed', 'cached'] }).notNull().default('queued'),
  error: text('error'),

  // Results (stored as JSON)
  result: text('result'), // JSON string of LighthouseScanResult
  fetchTime: text('fetch_time'),

  // Scores for easy querying
  performanceScore: integer('performance_score'), // 0-100
  accessibilityScore: integer('accessibility_score'), // 0-100
  bestPracticesScore: integer('best_practices_score'), // 0-100
  seoScore: integer('seo_score'), // 0-100

  // Metadata
  cached: integer('cached', { mode: 'boolean' }).notNull().default(false),
  endpoint: text('endpoint', { enum: ['self-hosted', 'browserless'] }).notNull().default('browserless'),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Scan = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
