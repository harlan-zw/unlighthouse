// v2 sqlite schema — single source of truth for all SQL backends.
// Replaces the v1 schema with a cleaner design:
//   - Dashboard aggregation tables removed (packs handle cross-route analysis)
//   - Core tables enriched with full LH13 coverage (agentic-browsing, screenshots)
//   - Scan mode (page/site) tracked on the scans row
//   - Comparison + assertion tables retained (structural, not aggregation)
//
// The drizzle table IS part of the contract: any storage adapter targeting SQL
// (better-sqlite3, node:sqlite, D1) imports these tables so all SQL backends
// share one schema definition.
import type { Scan } from '../types/atoms'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ============================================================================
// Core tables
// ============================================================================

export const sites = sqliteTable(
  'sites',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    group: text('group'),
    createdAt: text('created_at').notNull(),
  },
  table => [
    index('idx_sites_url').on(table.url),
  ],
)

export const scans = sqliteTable(
  'scans',
  {
    scanId: text('scan_id').primaryKey(),
    siteId: text('site_id').references(() => sites.id, { onDelete: 'set null' }),
    site: text('site').notNull(),
    mode: text('mode').notNull().default('site'),
    device: text('device').notNull(),
    status: text('status').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    ciBranch: text('ci_branch'),
    ciCommit: text('ci_commit'),
    ciCommitMessage: text('ci_commit_message'),
    summary: text('summary', { mode: 'json' }).$type<NonNullable<Scan['summary']>>(),
    createdAtMs: integer('created_at_ms').notNull().default(sql`(unixepoch() * 1000)`),
  },
  table => [
    index('idx_scans_site').on(table.site),
    index('idx_scans_status').on(table.status),
    index('idx_scans_started_at').on(table.startedAt),
    index('idx_scans_site_id').on(table.siteId),
    index('idx_scans_find_previous').on(table.site, table.device, table.ciBranch, table.startedAt),
  ],
)

export const scanRoutes = sqliteTable(
  'scan_routes',
  {
    scanId: text('scan_id')
      .notNull()
      .references(() => scans.scanId, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    device: text('device').notNull().default('mobile'),
    path: text('path').notNull(),
    routeName: text('route_name'),

    // Category scores (0..1, nullable when category didn't run)
    scorePerformance: real('score_performance'),
    scoreAccessibility: real('score_accessibility'),
    scoreSeo: real('score_seo'),
    scoreBestPractices: real('score_best_practices'),
    scoreAgenticBrowsing: real('score_agentic_browsing'),

    // Core Web Vitals + perf metrics
    lcp: real('lcp'),
    cls: real('cls'),
    inp: real('inp'),
    fcp: real('fcp'),
    ttfb: real('ttfb'),
    tbt: real('tbt'),
    si: real('si'),

    lighthouseVersion: text('lighthouse_version').notNull(),
    capturedAt: text('captured_at').notNull(),

    // Blob store keys
    lhrBlobKey: text('lhr_blob_key').notNull(),
    reportBlobKey: text('report_blob_key'),
    screenshotBlobKey: text('screenshot_blob_key'),
  },
  table => [
    primaryKey({ columns: [table.scanId, table.url, table.device] }),
    index('idx_scan_routes_scan_id').on(table.scanId),
  ],
)

export const packRuns = sqliteTable(
  'pack_runs',
  {
    scanId: text('scan_id')
      .notNull()
      .references(() => scans.scanId, { onDelete: 'cascade' }),
    packName: text('pack_name').notNull(),
    packVersion: text('pack_version').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at').notNull(),
    report: text('report', { mode: 'json' }).$type<unknown>(),
    reportBlobKey: text('report_blob_key'),
  },
  table => [
    primaryKey({ columns: [table.scanId, table.packName, table.packVersion] }),
    index('idx_pack_runs_scan_id').on(table.scanId),
  ],
)

// ============================================================================
// Comparison + Assertion tables (structural, not aggregation)
// ============================================================================

export const comparisons = sqliteTable(
  'comparisons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    baseScanId: text('base_scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
    currentScanId: text('current_scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
    improved: integer('improved').notNull().default(0),
    regressed: integer('regressed').notNull().default(0),
    unchanged: integer('unchanged').notNull().default(0),
    newUrls: integer('new_urls').notNull().default(0),
    removedUrls: integer('removed_urls').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  },
  table => [
    index('idx_comparisons_scans').on(table.baseScanId, table.currentScanId),
  ],
)

export const comparisonDiffs = sqliteTable(
  'comparison_diffs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    comparisonId: integer('comparison_id').references(() => comparisons.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    url: text('url').notNull(),
    metricDiffs: text('metric_diffs').notNull(),
    severity: text('severity').notNull(),
  },
  table => [
    index('idx_diffs_comparison').on(table.comparisonId),
  ],
)

export const assertions = sqliteTable('assertions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  category: text('category'),
  metric: text('metric'),
  value: real('value').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  actual: real('actual').notNull(),
  failingRoutes: text('failing_routes'),
})

// ============================================================================
// CrUX field data (external source, not derived from LHR)
// ============================================================================

export const scanCrux = sqliteTable(
  'scan_crux',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scanId: text('scan_id').notNull().references(() => scans.scanId, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    formFactor: text('form_factor', { enum: ['PHONE', 'DESKTOP'] }).notNull(),
    seriesJson: text('series_json').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  },
  table => [
    index('idx_scan_crux_scan').on(table.scanId, table.formFactor),
  ],
)

// ============================================================================
// Inferred row types
// ============================================================================

export type SiteRow = typeof sites.$inferSelect
export type SiteRowInsert = typeof sites.$inferInsert
export type ScanRow = typeof scans.$inferSelect
export type ScanRowInsert = typeof scans.$inferInsert
export type ScanRouteRow = typeof scanRoutes.$inferSelect
export type ScanRouteRowInsert = typeof scanRoutes.$inferInsert
export type PackRunRow = typeof packRuns.$inferSelect
export type PackRunRowInsert = typeof packRuns.$inferInsert
export type ComparisonRow = typeof comparisons.$inferSelect
export type ComparisonDiffRow = typeof comparisonDiffs.$inferSelect
export type AssertionRow = typeof assertions.$inferSelect
export type ScanCruxRow = typeof scanCrux.$inferSelect

// ============================================================================
// Backward-compat re-exports for code that imports old dashboard table types.
// These are now empty stubs — the tables no longer exist in the schema.
// Dashboard data is served by packs (pack_runs table) instead.
// ============================================================================

// The old dashboard aggregation tables (performanceIssues, accessibilityIssues,
// seoMeta, etc.) have been removed. All cross-route analysis now flows through
// the pack system: pack.run produces a typed report cached in pack_runs.
// Code that previously read from these tables should migrate to reading pack
// reports via PackRunRepository.get(scanId, packName, packVersion).
