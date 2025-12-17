import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { desc, eq } from 'drizzle-orm'
import Database from 'better-sqlite3'
import fs from 'fs-extra'
import * as schema from './schema'
import { useLogger } from '../../logger'

export * from './schema'
export * from './tracking'

let db: ReturnType<typeof drizzle<typeof schema>> | null = null
let sqlite: Database.Database | null = null

/**
 * Get or create database connection
 */
export function getHistoryDb(dataDir: string) {
  if (db) return db

  const logger = useLogger()
  const dbPath = join(dataDir, 'history.db')

  // Ensure directory exists
  fs.ensureDirSync(dataDir)

  logger.debug(`Opening history database at: ${dbPath}`)

  sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  db = drizzle(sqlite, { schema })

  // Run migrations inline (simple approach for local usage)
  initializeSchema(sqlite)

  return db
}

/**
 * Close database connection
 */
export function closeHistoryDb() {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}

/**
 * Initialize database schema
 */
function initializeSchema(sqlite: Database.Database) {
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
      status TEXT NOT NULL DEFAULT 'pending',
      scanned_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_scans_site ON scans(site);
    CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
    CREATE INDEX IF NOT EXISTS idx_scans_started_at ON scans(started_at);
    CREATE INDEX IF NOT EXISTS idx_scan_routes_scan_id ON scan_routes(scan_id);
  `)
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Create a new scan record
 */
export function createScan(dataDir: string, data: schema.NewScan): schema.Scan {
  const db = getHistoryDb(dataDir)
  const [scan] = db.insert(schema.scans).values(data).returning()
  return scan
}

/**
 * Update a scan record
 */
export function updateScan(dataDir: string, id: string, data: Partial<schema.NewScan>): schema.Scan | undefined {
  const db = getHistoryDb(dataDir)
  const [scan] = db.update(schema.scans).set(data).where(eq(schema.scans.id, id)).returning()
  return scan
}

/**
 * Get a scan by ID
 */
export function getScan(dataDir: string, id: string): schema.Scan | undefined {
  const db = getHistoryDb(dataDir)
  return db.query.scans.findFirst({ where: eq(schema.scans.id, id) })
}

/**
 * List scans with pagination
 */
export function listScans(dataDir: string, options: { limit?: number, offset?: number, site?: string } = {}) {
  const db = getHistoryDb(dataDir)
  const { limit = 50, offset = 0, site } = options

  const where = site ? eq(schema.scans.site, site) : undefined

  return db.query.scans.findMany({
    where,
    limit,
    offset,
    orderBy: [desc(schema.scans.startedAt)],
  })
}

/**
 * Delete a scan and its routes
 */
export function deleteScan(dataDir: string, id: string): boolean {
  const db = getHistoryDb(dataDir)
  const result = db.delete(schema.scans).where(eq(schema.scans.id, id))
  return result.changes > 0
}

/**
 * Add a route to a scan
 */
export function addScanRoute(dataDir: string, data: schema.NewScanRoute): schema.ScanRoute {
  const db = getHistoryDb(dataDir)
  const [route] = db.insert(schema.scanRoutes).values(data).returning()
  return route
}

/**
 * Update a scan route
 */
export function updateScanRoute(dataDir: string, id: number, data: Partial<schema.NewScanRoute>): schema.ScanRoute | undefined {
  const db = getHistoryDb(dataDir)
  const [route] = db.update(schema.scanRoutes).set(data).where(eq(schema.scanRoutes.id, id)).returning()
  return route
}

/**
 * Get routes for a scan
 */
export function getScanRoutes(dataDir: string, scanId: string): schema.ScanRoute[] {
  const db = getHistoryDb(dataDir)
  return db.query.scanRoutes.findMany({
    where: eq(schema.scanRoutes.scanId, scanId),
  })
}

/**
 * Get scan with routes
 */
export function getScanWithRoutes(dataDir: string, id: string) {
  const db = getHistoryDb(dataDir)
  const scan = db.query.scans.findFirst({ where: eq(schema.scans.id, id) })
  if (!scan) return null

  const routes = db.query.scanRoutes.findMany({
    where: eq(schema.scanRoutes.scanId, id),
  })

  return { ...scan, routes }
}

/**
 * Update scan aggregate scores from routes
 */
export function updateScanScores(dataDir: string, scanId: string) {
  const db = getHistoryDb(dataDir)
  const routes = db.query.scanRoutes.findMany({
    where: eq(schema.scanRoutes.scanId, scanId),
  })

  const completedRoutes = routes.filter(r => r.status === 'complete' && r.score !== null)
  if (completedRoutes.length === 0) return

  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((n): n is number => n !== null)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
  }

  const update: Partial<schema.NewScan> = {
    scannedCount: completedRoutes.length,
    failedCount: routes.filter(r => r.status === 'failed').length,
    avgScore: avg(completedRoutes.map(r => r.score)),
    performanceScore: avg(completedRoutes.map(r => r.performanceScore)),
    accessibilityScore: avg(completedRoutes.map(r => r.accessibilityScore)),
    bestPracticesScore: avg(completedRoutes.map(r => r.bestPracticesScore)),
    seoScore: avg(completedRoutes.map(r => r.seoScore)),
  }

  db.update(schema.scans).set(update).where(eq(schema.scans.id, scanId)).run()
}
