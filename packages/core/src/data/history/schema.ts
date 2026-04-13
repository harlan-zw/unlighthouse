import { sql } from 'drizzle-orm'
import { blob, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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

  // Core Web Vitals (stable across LH versions)
  lcp: integer('lcp'), // Largest Contentful Paint (ms)
  cls: integer('cls'), // Cumulative Layout Shift (x1000 for int storage)
  tbt: integer('tbt'), // Total Blocking Time (ms)
  fcp: integer('fcp'), // First Contentful Paint (ms)
  si: integer('si'), // Speed Index (ms)
  ttfb: integer('ttfb'), // Time to First Byte (ms)

  // Raw LHR for deep dives (gzipped JSON)
  lhrGzip: blob('lhr_gzip', { mode: 'buffer' }),

  // Status
  status: text('status', { enum: ['pending', 'scanning', 'complete', 'failed'] }).notNull().default('pending'),

  // Timestamps
  scannedAt: integer('scanned_at', { mode: 'timestamp' }),
})

// ============================================================================
// Performance Dashboard Tables
// ============================================================================

export const performanceIssues = sqliteTable('performance_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'image' | 'script' | 'stylesheet' | 'font' | 'render-blocking'
  url: text('url').notNull(),

  wastedBytes: integer('wasted_bytes'),
  wastedMs: integer('wasted_ms'),

  pageCount: integer('page_count').notNull().default(1),
  pages: text('pages'), // JSON array of paths

  issueSubtype: text('issue_subtype'), // 'resize' | 'format' | 'lazy' | 'unused'
  details: text('details'), // JSON
})

export const thirdPartyScripts = sqliteTable('third_party_scripts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  entity: text('entity').notNull(), // "Google Analytics", "Facebook"
  url: text('url').notNull(),
  avgTbt: integer('avg_tbt'),
  totalTbt: integer('total_tbt'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const lcpElements = sqliteTable('lcp_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  selector: text('selector').notNull(),
  elementType: text('element_type'), // 'image' | 'text' | 'video'
  avgLcp: integer('avg_lcp'),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

// ============================================================================
// Accessibility Dashboard Tables
// ============================================================================

export const accessibilityIssues = sqliteTable('accessibility_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  auditId: text('audit_id').notNull(), // 'color-contrast', 'image-alt'
  title: text('title').notNull(),
  severity: text('severity').notNull(), // 'critical' | 'serious' | 'moderate' | 'minor'

  wcagCriteria: text('wcag_criteria'), // JSON array: ['1.4.3', '1.4.6']
  wcagLevel: text('wcag_level'), // 'A' | 'AA' | 'AAA'

  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const accessibilityElements = sqliteTable('accessibility_elements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  selector: text('selector').notNull(),
  snippet: text('snippet'),

  auditId: text('audit_id').notNull(),
  severity: text('severity').notNull(),
  issueDescription: text('issue_description'),

  // For contrast issues
  foregroundColor: text('foreground_color'),
  backgroundColor: text('background_color'),
  contrastRatio: real('contrast_ratio'),
  requiredRatio: real('required_ratio'),

  // Element screenshot cropping
  boundingRect: text('bounding_rect'), // JSON { left, top, width, height }
  screenshotPage: text('screenshot_page'), // path of first page with screenshot data

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const missingAltImages = sqliteTable('missing_alt_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  url: text('url').notNull(),
  thumbnail: text('thumbnail'),
  isDecorative: integer('is_decorative', { mode: 'boolean' }).default(false),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

// ============================================================================
// Best Practices Dashboard Tables
// ============================================================================

export const securityIssues = sqliteTable('security_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'mixed-content' | 'unsafe-link' | 'csp' | 'hsts'
  severity: text('severity').notNull(), // 'critical' | 'high' | 'medium' | 'low'

  description: text('description'),
  details: text('details'), // JSON

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const detectedLibraries = sqliteTable('detected_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  version: text('version'),
  sourceFile: text('source_file'),

  status: text('status').notNull(), // 'current' | 'outdated' | 'vulnerable' | 'deprecated'

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const vulnerableLibraries = sqliteTable('vulnerable_libraries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  name: text('name').notNull(),
  version: text('version').notNull(),
  severity: text('severity').notNull(), // 'critical' | 'high' | 'medium' | 'low'

  cves: text('cves'), // JSON array
  description: text('description'),
  recommendation: text('recommendation'),
  sourceFile: text('source_file'),

  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const deprecatedApis = sqliteTable('deprecated_apis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

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
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  message: text('message').notNull(),
  normalizedMessage: text('normalized_message'),

  sourceType: text('source_type').notNull(), // 'app' | 'network' | 'csp' | 'thirdParty'
  sourceFile: text('source_file'),
  stackTrace: text('stack_trace'),

  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

// ============================================================================
// SEO Dashboard Tables
// ============================================================================

export const seoMeta = sqliteTable('seo_meta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),
  routeId: integer('route_id').references(() => scanRoutes.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),

  title: text('title'),
  titleLength: integer('title_length'),
  metaDescription: text('meta_description'),
  metaDescriptionLength: integer('meta_description_length'),

  isIndexable: integer('is_indexable', { mode: 'boolean' }).default(true),
  robotsDirective: text('robots_directive'),
  blockedByRobotsTxt: integer('blocked_by_robots_txt', { mode: 'boolean' }).default(false),

  canonical: text('canonical'),
  canonicalType: text('canonical_type'), // 'self' | 'other' | 'missing'

  ogTitle: text('og_title'),
  ogDescription: text('og_description'),
  ogImage: text('og_image'),
  ogUrl: text('og_url'),

  twitterCard: text('twitter_card'),
  twitterTitle: text('twitter_title'),
  twitterDescription: text('twitter_description'),
  twitterImage: text('twitter_image'),

  hasStructuredData: integer('has_structured_data', { mode: 'boolean' }).default(false),
  structuredDataTypes: text('structured_data_types'), // JSON array
  structuredDataValid: integer('structured_data_valid', { mode: 'boolean' }),
  structuredDataWarnings: text('structured_data_warnings'),

  hreflangTags: text('hreflang_tags'), // JSON array
})

export const seoDuplicates = sqliteTable('seo_duplicates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'title' | 'meta_description'
  value: text('value').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'), // JSON array
})

export const canonicalChains = sqliteTable('canonical_chains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  chainType: text('chain_type').notNull(), // 'chain' | 'loop'
  pages: text('pages').notNull(), // JSON array
  finalTarget: text('final_target'),
})

export const linkTextIssues = sqliteTable('link_text_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  text: text('text').notNull(), // "Click here", "Read more"
  instanceCount: integer('instance_count').notNull(),
  pageCount: integer('page_count').notNull(),
  pages: text('pages'),
})

export const tapTargetIssues = sqliteTable('tap_target_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  path: text('path').notNull(),
  elementCount: integer('element_count').notNull(),
  elements: text('elements'), // JSON array
})

// ============================================================================
// History Comparison Tables (LHCI-style)
// ============================================================================

export const comparisons = sqliteTable('comparisons', {
  id: integer('id').primaryKey({ autoIncrement: true }),

  baseScanId: text('base_scan_id').references(() => scans.id, { onDelete: 'cascade' }),
  currentScanId: text('current_scan_id').references(() => scans.id, { onDelete: 'cascade' }),

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

  metricDiffs: text('metric_diffs').notNull(), // JSON array of {name, base, current, delta, severity}

  severity: text('severity').notNull(), // 'improvement' | 'regression' | 'neutral'
})

export const assertions = sqliteTable('assertions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }),

  type: text('type').notNull(), // 'minScore' | 'maxNumericValue' | 'maxRegression'
  category: text('category'), // 'performance' | 'accessibility'
  metric: text('metric'), // 'lcp' | 'cls'
  value: real('value').notNull(),

  passed: integer('passed', { mode: 'boolean' }).notNull(),
  actual: real('actual').notNull(),

  failingRoutes: text('failing_routes'), // JSON array
})

// ============================================================================
// Dashboard Summaries (Computed/Cached)
// ============================================================================

export const dashboardSummaries = sqliteTable('dashboard_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: text('scan_id').references(() => scans.id, { onDelete: 'cascade' }).unique(),

  performanceSummary: text('performance_summary'), // JSON
  accessibilitySummary: text('accessibility_summary'), // JSON
  bestPracticesSummary: text('best_practices_summary'), // JSON
  seoSummary: text('seo_summary'), // JSON

  computedAt: integer('computed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ============================================================================
// Type exports
// ============================================================================

export type Scan = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
export type ScanRoute = typeof scanRoutes.$inferSelect
export type NewScanRoute = typeof scanRoutes.$inferInsert

export type PerformanceIssue = typeof performanceIssues.$inferSelect
export type AccessibilityIssue = typeof accessibilityIssues.$inferSelect
export type SeoMetaRecord = typeof seoMeta.$inferSelect
export type Comparison = typeof comparisons.$inferSelect
export type DashboardSummary = typeof dashboardSummaries.$inferSelect
