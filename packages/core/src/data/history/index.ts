import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { NewScan, NewScanRoute, Scan, ScanRoute } from './schema'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { desc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'fs-extra'
import { scanRoutes, scans } from './schema'

export * from './schema'
export { cancelHistoryTracking, failHistoryTracking, getCurrentScanId, initHistoryTracking } from './tracking'

// Database connection cache
let dbInstance: BetterSQLite3Database | null = null
let dbPath: string | null = null

/**
 * Get or create database connection
 */
export function getHistoryDb(dataDir: string): BetterSQLite3Database {
  const targetPath = join(dataDir, 'history.db')

  // Return cached instance if same path
  if (dbInstance && dbPath === targetPath)
    return dbInstance

  // Ensure directory exists
  fs.ensureDirSync(dataDir)

  // Create new connection
  const sqlite = new Database(targetPath)
  dbInstance = drizzle(sqlite)
  dbPath = targetPath

  // Create tables if not exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      site TEXT NOT NULL,
      device TEXT NOT NULL DEFAULT 'mobile',
      throttle INTEGER NOT NULL DEFAULT 0,
      route_count INTEGER NOT NULL DEFAULT 0,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      avg_score INTEGER,
      performance_score INTEGER,
      accessibility_score INTEGER,
      best_practices_score INTEGER,
      seo_score INTEGER,
      status TEXT NOT NULL DEFAULT 'running',
      error TEXT,
      report_path TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch()),
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scan_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      url TEXT NOT NULL,
      score INTEGER,
      performance_score INTEGER,
      accessibility_score INTEGER,
      best_practices_score INTEGER,
      seo_score INTEGER,
      lcp INTEGER,
      cls INTEGER,
      tbt INTEGER,
      fcp INTEGER,
      si INTEGER,
      ttfb INTEGER,
      lhr_gzip BLOB,
      status TEXT NOT NULL DEFAULT 'pending',
      scanned_at INTEGER
    );

    -- Performance tables
    CREATE TABLE IF NOT EXISTS performance_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      wasted_bytes INTEGER,
      wasted_ms INTEGER,
      page_count INTEGER NOT NULL DEFAULT 1,
      pages TEXT,
      issue_subtype TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS third_party_scripts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      entity TEXT NOT NULL,
      url TEXT NOT NULL,
      avg_tbt INTEGER,
      total_tbt INTEGER,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS lcp_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      selector TEXT NOT NULL,
      element_type TEXT,
      avg_lcp INTEGER,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    -- Accessibility tables
    CREATE TABLE IF NOT EXISTS accessibility_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      audit_id TEXT NOT NULL,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      wcag_criteria TEXT,
      wcag_level TEXT,
      instance_count INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS accessibility_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      selector TEXT NOT NULL,
      snippet TEXT,
      audit_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      issue_description TEXT,
      foreground_color TEXT,
      background_color TEXT,
      contrast_ratio REAL,
      required_ratio REAL,
      bounding_rect TEXT,
      screenshot_page TEXT,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS missing_alt_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      thumbnail TEXT,
      is_decorative INTEGER DEFAULT 0,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    -- Best practices tables
    CREATE TABLE IF NOT EXISTS security_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      description TEXT,
      details TEXT,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS detected_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version TEXT,
      source_file TEXT,
      status TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS vulnerable_libraries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      severity TEXT NOT NULL,
      cves TEXT,
      description TEXT,
      recommendation TEXT,
      source_file TEXT,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS deprecated_apis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      api TEXT NOT NULL,
      description TEXT,
      alternative TEXT,
      removal_date TEXT,
      is_third_party INTEGER DEFAULT 0,
      source_file TEXT,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS console_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      normalized_message TEXT,
      source_type TEXT NOT NULL,
      source_file TEXT,
      stack_trace TEXT,
      instance_count INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    -- SEO tables
    CREATE TABLE IF NOT EXISTS seo_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      route_id INTEGER REFERENCES scan_routes(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      title TEXT,
      title_length INTEGER,
      meta_description TEXT,
      meta_description_length INTEGER,
      is_indexable INTEGER DEFAULT 1,
      robots_directive TEXT,
      blocked_by_robots_txt INTEGER DEFAULT 0,
      canonical TEXT,
      canonical_type TEXT,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      og_url TEXT,
      twitter_card TEXT,
      twitter_title TEXT,
      twitter_description TEXT,
      twitter_image TEXT,
      has_structured_data INTEGER DEFAULT 0,
      structured_data_types TEXT,
      structured_data_valid INTEGER,
      structured_data_warnings TEXT,
      hreflang_tags TEXT
    );

    CREATE TABLE IF NOT EXISTS seo_duplicates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      value TEXT NOT NULL,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS canonical_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      chain_type TEXT NOT NULL,
      pages TEXT NOT NULL,
      final_target TEXT
    );

    CREATE TABLE IF NOT EXISTS link_text_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      instance_count INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      pages TEXT
    );

    CREATE TABLE IF NOT EXISTS tap_target_issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      element_count INTEGER NOT NULL,
      elements TEXT
    );

    -- Comparison tables
    CREATE TABLE IF NOT EXISTS comparisons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      current_scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      improved INTEGER NOT NULL DEFAULT 0,
      regressed INTEGER NOT NULL DEFAULT 0,
      unchanged INTEGER NOT NULL DEFAULT 0,
      new_urls INTEGER NOT NULL DEFAULT 0,
      removed_urls INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS comparison_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comparison_id INTEGER REFERENCES comparisons(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      url TEXT NOT NULL,
      metric_diffs TEXT NOT NULL,
      severity TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assertions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      category TEXT,
      metric TEXT,
      value REAL NOT NULL,
      passed INTEGER NOT NULL,
      actual REAL NOT NULL,
      failing_routes TEXT
    );

    -- Dashboard summaries
    CREATE TABLE IF NOT EXISTS dashboard_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT UNIQUE REFERENCES scans(id) ON DELETE CASCADE,
      performance_summary TEXT,
      accessibility_summary TEXT,
      best_practices_summary TEXT,
      seo_summary TEXT,
      computed_at INTEGER DEFAULT (unixepoch())
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_scan_routes_scan_id ON scan_routes(scan_id);
    CREATE INDEX IF NOT EXISTS idx_scan_routes_scan_path ON scan_routes(scan_id, path);
    CREATE INDEX IF NOT EXISTS idx_perf_issues_scan_type ON performance_issues(scan_id, type);
    CREATE INDEX IF NOT EXISTS idx_third_party_scan ON third_party_scripts(scan_id);
    CREATE INDEX IF NOT EXISTS idx_a11y_issues_scan_severity ON accessibility_issues(scan_id, severity);
    CREATE INDEX IF NOT EXISTS idx_a11y_elements_scan ON accessibility_elements(scan_id);
    CREATE INDEX IF NOT EXISTS idx_seo_meta_scan ON seo_meta(scan_id);
    CREATE INDEX IF NOT EXISTS idx_seo_duplicates_scan ON seo_duplicates(scan_id, type);
    CREATE INDEX IF NOT EXISTS idx_comparisons_scans ON comparisons(base_scan_id, current_scan_id);
    CREATE INDEX IF NOT EXISTS idx_diffs_comparison ON comparison_diffs(comparison_id);
  `)

  // Migrations for existing databases
  const migrations = [
    `ALTER TABLE accessibility_elements ADD COLUMN bounding_rect TEXT`,
    `ALTER TABLE accessibility_elements ADD COLUMN screenshot_page TEXT`,
  ]
  for (const migration of migrations) {
    try { sqlite.exec(migration) }
    catch {}
  }

  return dbInstance
}

/**
 * Close database connection
 */
export function closeHistoryDb() {
  dbInstance = null
  dbPath = null
}

// ============================================================================
// CRUD Operations
// ============================================================================

export function createScan(dataDir: string, data: Omit<NewScan, 'startedAt'>): Scan {
  const db = getHistoryDb(dataDir)
  const result = db.insert(scans).values({
    ...data,
    startedAt: new Date(),
  }).returning().get()
  return result
}

export function updateScan(dataDir: string, id: string, data: Partial<NewScan>): Scan | undefined {
  const db = getHistoryDb(dataDir)
  const result = db.update(scans)
    .set(data)
    .where(eq(scans.id, id))
    .returning()
    .get()
  return result
}

export function getScan(dataDir: string, id: string): Scan | undefined {
  const db = getHistoryDb(dataDir)
  return db.select().from(scans).where(eq(scans.id, id)).get()
}

export function listScans(dataDir: string, options: { limit?: number, offset?: number, site?: string } = {}): Scan[] {
  const db = getHistoryDb(dataDir)
  const { limit = 50, offset = 0, site } = options

  let query = db.select().from(scans).orderBy(desc(scans.startedAt))

  if (site)
    query = query.where(eq(scans.site, site)) as any

  return query.limit(limit).offset(offset).all()
}

export function deleteScan(dataDir: string, id: string): boolean {
  const db = getHistoryDb(dataDir)
  const result = db.delete(scans).where(eq(scans.id, id)).returning().get()
  return !!result
}

export function addScanRoute(dataDir: string, data: Omit<NewScanRoute, 'id'>): ScanRoute {
  const db = getHistoryDb(dataDir)
  return db.insert(scanRoutes).values(data).returning().get()
}

export function updateScanRoute(dataDir: string, id: number, data: Partial<NewScanRoute>): ScanRoute | undefined {
  const db = getHistoryDb(dataDir)
  return db.update(scanRoutes)
    .set(data)
    .where(eq(scanRoutes.id, id))
    .returning()
    .get()
}

export function getScanRoutes(dataDir: string, scanId: string): ScanRoute[] {
  const db = getHistoryDb(dataDir)
  return db.select().from(scanRoutes).where(eq(scanRoutes.scanId, scanId)).all()
}

export function getScanWithRoutes(dataDir: string, id: string): (Scan & { routes: ScanRoute[] }) | null {
  const db = getHistoryDb(dataDir)
  const scan = db.select().from(scans).where(eq(scans.id, id)).get()
  if (!scan)
    return null

  const routes = db.select().from(scanRoutes).where(eq(scanRoutes.scanId, id)).all()
  return { ...scan, routes }
}

export function updateScanScores(dataDir: string, scanId: string) {
  const db = getHistoryDb(dataDir)

  // Calculate average scores from completed routes
  const result = db.select({
    avgScore: sql<number>`ROUND(AVG(score))`,
    performanceScore: sql<number>`ROUND(AVG(performance_score))`,
    accessibilityScore: sql<number>`ROUND(AVG(accessibility_score))`,
    bestPracticesScore: sql<number>`ROUND(AVG(best_practices_score))`,
    seoScore: sql<number>`ROUND(AVG(seo_score))`,
    scannedCount: sql<number>`COUNT(CASE WHEN status = 'complete' THEN 1 END)`,
    failedCount: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
  })
    .from(scanRoutes)
    .where(eq(scanRoutes.scanId, scanId))
    .get()

  if (result) {
    db.update(scans)
      .set({
        avgScore: result.avgScore,
        performanceScore: result.performanceScore,
        accessibilityScore: result.accessibilityScore,
        bestPracticesScore: result.bestPracticesScore,
        seoScore: result.seoScore,
        scannedCount: result.scannedCount,
        failedCount: result.failedCount,
      })
      .where(eq(scans.id, scanId))
      .run()
  }
}
