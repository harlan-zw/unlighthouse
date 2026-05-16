// v1 sqlite schema. Mirrors the `Scan` and `ScanRoute` atoms from
// `@unlighthouse/contracts` at the storage layer, plus the dashboard-private
// aggregation tables (performance/accessibility/seo/best-practices/comparison/
// CrUX/dashboard summary). The drizzle table IS part of the contract: any
// storage adapter targeting SQL (better-sqlite3, node:sqlite, D1) imports
// these tables so all SQL backends share one schema definition.
//
// Lives at the `./drizzle` subpath so the default `@unlighthouse/contracts`
// import stays dependency-free (UI / MCP / Worker bundles never pull
// `drizzle-orm`).
import type { Scan } from '../types/atoms'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ============================================================================
// Core scan/route tables (mirror contract atoms)
// ============================================================================

/**
 * Scans table — stores scan session metadata.
 *
 * `summary` stored as JSON. Timestamps are ISO strings (matches the contract
 * `z.iso.datetime()`). `device`/`status` are stored as plain text — the
 * contract enum is the truth, not a sqlite CHECK constraint (D1 and pure
 * sqlite disagree on enforcement semantics).
 */
export const scans = sqliteTable(
  'scans',
  {
    scanId: text('scan_id').primaryKey(),
    site: text('site').notNull(),
    device: text('device').notNull(),
    status: text('status').notNull(),
    startedAt: text('started_at').notNull(),
    completedAt: text('completed_at'),
    ciBranch: text('ci_branch'),
    ciCommit: text('ci_commit'),
    ciCommitMessage: text('ci_commit_message'),
    summary: text('summary', { mode: 'json' }).$type<NonNullable<Scan['summary']>>(),
    // Internal row-creation index (NOT a contract field). Used to order
    // `findPrevious` deterministically when two scans share startedAt.
    createdAtMs: integer('created_at_ms').notNull().default(sql`(unixepoch() * 1000)`),
  },
  table => [
    index('idx_scans_site').on(table.site),
    index('idx_scans_status').on(table.status),
    index('idx_scans_started_at').on(table.startedAt),
    index('idx_scans_find_previous').on(table.site, table.device, table.ciBranch, table.startedAt),
  ],
)

/**
 * Scan routes table — one row per (scanId, url, device). Mirrors `ScanRoute`,
 * which extends `ExtractedMetrics` with `scanId`, `device`, and `lhrBlobKey`.
 *
 * D-029: `device` is part of the PK so a single scan can audit the same URL
 * on mobile + desktop in one pass. Old single-device scans land here with
 * `device: 'mobile'` (the historical default) — no row backfill required.
 *
 * Metric columns are flattened (not stored as JSON) because the comparison +
 * assertion engines do column-wise SQL aggregation. The raw LHR + UI-reconciled
 * report blobs live in the blob store, keyed by `lhrBlobKey` / `reportBlobKey`.
 */
export const scanRoutes = sqliteTable(
  'scan_routes',
  {
    scanId: text('scan_id')
      .notNull()
      .references(() => scans.scanId, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    // D-029: identity column. 'mobile' is the historical default; a scan that
    // doesn't opt into the matrix sees the same single row it always did.
    device: text('device').notNull().default('mobile'),
    path: text('path').notNull(),
    routeName: text('route_name'),
    scorePerformance: real('score_performance'),
    scoreAccessibility: real('score_accessibility'),
    scoreSeo: real('score_seo'),
    scoreBestPractices: real('score_best_practices'),
    lcp: real('lcp'),
    cls: real('cls'),
    inp: real('inp'),
    fcp: real('fcp'),
    ttfb: real('ttfb'),
    tbt: real('tbt'),
    si: real('si'),
    lighthouseVersion: text('lighthouse_version').notNull(),
    capturedAt: text('captured_at').notNull(),
    /** Raw Lighthouse result (LHCI-format, gzipped). Read via `storage.blobs.get`. */
    lhrBlobKey: text('lhr_blob_key').notNull(),
    /**
     * UI-reconciled per-route report (JSON). Decoupled from LHR shape so
     * generateClient + dashboard handlers don't gunzip the LHR on every read.
     * Nullable for rows written before the reconciliation pipeline landed.
     */
    reportBlobKey: text('report_blob_key'),
  },
  table => [
    primaryKey({ columns: [table.scanId, table.url, table.device] }),
    index('idx_scan_routes_scan_id').on(table.scanId),
  ],
)

export type ScanRow = typeof scans.$inferSelect
export type ScanRowInsert = typeof scans.$inferInsert
export type ScanRouteRow = typeof scanRoutes.$inferSelect
export type ScanRouteRowInsert = typeof scanRoutes.$inferInsert

/**
 * Pack runs (D-028). One row per (scanId, packName, packVersion) — packs
 * reconcile a scan's routes into a typed report. Since scans are immutable,
 * the report is too; the row is the cache. Bumping a pack's version on a
 * subsequent code change is what invalidates a stale entry.
 *
 * Small reports live in `report` (JSON column). Anything that doesn't fit
 * comfortably inline spills to a blob keyed by `reportBlobKey` — same pattern
 * as `scan_routes.lhrBlobKey`.
 */
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

export type PackRunRow = typeof packRuns.$inferSelect
export type PackRunRowInsert = typeof packRuns.$inferInsert

// ============================================================================
// Dashboard-private aggregation tables
//
// Populated by `core/report/processScanData` after a scan completes; consumed
// by the dashboard handlers. The aggregations are implementation-private (no
// contract atom) — adapter authors wiring against the `Storage` port don't
// need to know these shapes. The contract-level `Storage.reports` returns the
// raw row types below (via `$inferSelect`), so handler code that already does
// JSON-parsing on text columns continues to work.
// ============================================================================

export const performanceIssues = sqliteTable('performance_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  url: text('url').notNull(),
  wastedBytes: integer('wasted_bytes'),
  wastedMs: integer('wasted_ms'),
  pageCount: integer('page_count').notNull().default(1),
  pages: text('pages'),
  issueSubtype: text('issue_subtype'),
  details: text('details'),
})

export const thirdPartyScripts = sqliteTable('third_party_scripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  entity: text('entity').notNull(),
  url: text('url').notNull(),
  avgTbt: integer('avg_tbt'),
  totalTbt: integer('total_tbt'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const lcpElements = sqliteTable('lcp_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  selector: text('selector').notNull(),
  elementType: text('element_type'),
  avgLcp: integer('avg_lcp'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const accessibilityIssues = sqliteTable('accessibility_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  auditId: text('audit_id').notNull(),
  title: text('title').notNull(),
  severity: text('severity').notNull(),
  wcagCriteria: text('wcag_criteria'),
  wcagLevel: text('wcag_level'),
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const accessibilityElements = sqliteTable('accessibility_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  selector: text('selector').notNull(),
  snippet: text('snippet'),
  auditId: text('audit_id').notNull(),
  severity: text('severity').notNull(),
  issueDescription: text('issue_description'),
  foregroundColor: text('foreground_color'),
  backgroundColor: text('background_color'),
  contrastRatio: real('contrast_ratio'),
  requiredRatio: real('required_ratio'),
  boundingRect: text('bounding_rect'),
  screenshotPage: text('screenshot_page'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const missingAltImages = sqliteTable('missing_alt_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  thumbnail: text('thumbnail'),
  isDecorative: integer('is_decorative', { mode: 'boolean' }).default(false),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const securityIssues = sqliteTable('security_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  description: text('description'),
  details: text('details'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const detectedLibraries = sqliteTable('detected_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: text('version'),
  sourceFile: text('source_file'),
  status: text('status').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const vulnerableLibraries = sqliteTable('vulnerable_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: text('version').notNull(),
  severity: text('severity').notNull(),
  cves: text('cves'),
  description: text('description'),
  recommendation: text('recommendation'),
  sourceFile: text('source_file'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const deprecatedApis = sqliteTable('deprecated_apis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  api: text('api').notNull(),
  description: text('description'),
  alternative: text('alternative'),
  removalDate: text('removal_date'),
  isThirdParty: integer('is_third_party', { mode: 'boolean' }).default(false),
  sourceFile: text('source_file'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const consoleErrors = sqliteTable('console_errors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  normalizedMessage: text('normalized_message'),
  sourceType: text('source_type').notNull(),
  sourceFile: text('source_file'),
  stackTrace: text('stack_trace'),
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const seoMeta = sqliteTable('seo_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  title: text('title'),
  titleLength: integer('title_length'),
  metaDescription: text('meta_description'),
  metaDescriptionLength: integer('meta_description_length'),
  isIndexable: integer('is_indexable', { mode: 'boolean' }).default(true),
  robotsDirective: text('robots_directive'),
  blockedByRobotsTxt: integer('blocked_by_robots_txt', { mode: 'boolean' }).default(false),
  canonical: text('canonical'),
  canonicalType: text('canonical_type'),
  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImage: text('og_image'),
  ogUrl: text('og_url'),
  twitterCard: text('twitter_card'),
  twitterTitle: text('twitter_title'),
  twitterDescription: text('twitter_description'),
  twitterImage: text('twitter_image'),
  hasStructuredData: integer('has_structured_data', { mode: 'boolean' }).default(false),
  structuredDataTypes: text('structured_data_types'),
  structuredDataValid: integer('structured_data_valid', { mode: 'boolean' }),
  structuredDataWarnings: text('structured_data_warnings'),
  hreflangTags: text('hreflang_tags'),
})

export const seoDuplicates = sqliteTable('seo_duplicates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  value: text('value').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const canonicalChains = sqliteTable('canonical_chains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  chainType: text('chain_type').notNull(),
  pages: text('pages').notNull(),
  finalTarget: text('final_target'),
})

export const linkTextIssues = sqliteTable('link_text_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const tapTargetIssues = sqliteTable('tap_target_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  elementCount: integer('element_count').notNull(),
  elements: text('elements'),
})

export const comparisons = sqliteTable('comparisons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  baseScanId: text('base_scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  currentScanId: text('current_scan_id').references(() => scans.scanId, { onDelete: 'cascade' }),
  improved: integer('improved').notNull().default(0),
  regressed: integer('regressed').notNull().default(0),
  unchanged: integer('unchanged').notNull().default(0),
  newUrls: integer('new_urls').notNull().default(0),
  removedUrls: integer('removed_urls').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

export const comparisonDiffs = sqliteTable('comparison_diffs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  comparisonId: integer('comparison_id').references(() => comparisons.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  url: text('url').notNull(),
  metricDiffs: text('metric_diffs').notNull(),
  severity: text('severity').notNull(),
})

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

export const scanCrux = sqliteTable('scan_crux', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').notNull().references(() => scans.scanId, { onDelete: 'cascade' }),
  hostname: text('hostname').notNull(),
  formFactor: text('form_factor', { enum: ['PHONE', 'DESKTOP'] }).notNull(),
  seriesJson: text('series_json').notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const dashboardSummaries = sqliteTable('dashboard_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.scanId, { onDelete: 'cascade' }).unique(),
  performanceSummary: text('performance_summary'),
  accessibilitySummary: text('accessibility_summary'),
  bestPracticesSummary: text('best_practices_summary'),
  seoSummary: text('seo_summary'),
  computedAt: integer('computed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Inferred row types (for `Storage.reports.*.list` return shapes)
// ============================================================================

export type PerformanceIssueRow = typeof performanceIssues.$inferSelect
export type ThirdPartyScriptRow = typeof thirdPartyScripts.$inferSelect
export type LcpElementRow = typeof lcpElements.$inferSelect
export type AccessibilityIssueRow = typeof accessibilityIssues.$inferSelect
export type AccessibilityElementRow = typeof accessibilityElements.$inferSelect
export type MissingAltImageRow = typeof missingAltImages.$inferSelect
export type SecurityIssueRow = typeof securityIssues.$inferSelect
export type DetectedLibraryRow = typeof detectedLibraries.$inferSelect
export type VulnerableLibraryRow = typeof vulnerableLibraries.$inferSelect
export type DeprecatedApiRow = typeof deprecatedApis.$inferSelect
export type ConsoleErrorRow = typeof consoleErrors.$inferSelect
export type SeoMetaRow = typeof seoMeta.$inferSelect
export type SeoDuplicateRow = typeof seoDuplicates.$inferSelect
export type CanonicalChainRow = typeof canonicalChains.$inferSelect
export type LinkTextIssueRow = typeof linkTextIssues.$inferSelect
export type TapTargetIssueRow = typeof tapTargetIssues.$inferSelect
export type ComparisonRow = typeof comparisons.$inferSelect
export type ComparisonDiffRow = typeof comparisonDiffs.$inferSelect
export type AssertionRow = typeof assertions.$inferSelect
export type ScanCruxRow = typeof scanCrux.$inferSelect
export type DashboardSummaryRow = typeof dashboardSummaries.$inferSelect
