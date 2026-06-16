// Runtime migrations for sqlite databases that pre-date a schema bump.
// `INIT_SQL_STATEMENTS` covers fresh databases via `CREATE TABLE IF NOT
// EXISTS`, but that's a no-op against existing tables — so anything that
// adds a column, rewrites a primary key, etc., needs an explicit upgrade
// path. This module owns that path.
//
// Each migration is a pair of functions:
//   - `needs(db)` checks the db's current state. Cheap. Idempotent.
//   - `apply(db)` performs the migration inside a transaction. Throws on
//     real corruption; never on "already migrated."
//
// Run all of them in order at boot. Adding a new schema bump means
// appending one entry; old entries stay so an ancient database can
// catch up through every intermediate version.

import type { Database } from 'better-sqlite3'

interface Migration {
  /** Stable name for logging. */
  id: string
  /** True if the migration should run against this db. */
  needs: (db: Database) => boolean
  /** Apply the change. Wrap in a transaction. */
  apply: (db: Database) => void
}

// SQLite has no `IF NOT EXISTS` for ALTER and no first-class column
// metadata — but `PRAGMA table_info(<table>)` returns one row per
// column. Cheap, no transaction needed, returns [] for non-existent
// tables.
function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.some(r => r.name === column)
}

function tableExists(db: Database, table: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table)
  return row != null
}

const MIGRATIONS: Migration[] = [
  // D-029 — scan_routes PK widens from (scan_id, url) to
  // (scan_id, url, device). SQLite can't widen a PK in place; we rebuild
  // the table and copy rows over with device='mobile' (the historical
  // default for single-device scans). foreign_keys is briefly disabled so
  // the dependent aggregation tables don't reject the rename mid-flight.
  {
    id: 'd029-scan-routes-device-column',
    needs: db => tableExists(db, 'scan_routes') && !hasColumn(db, 'scan_routes', 'device'),
    apply: (db) => {
      db.pragma('foreign_keys = OFF')
      try {
        const migrate = db.transaction(() => {
          db.exec(`ALTER TABLE scan_routes RENAME TO scan_routes_d029_old`)
          db.exec(`
            CREATE TABLE scan_routes (
              scan_id text NOT NULL,
              url text NOT NULL,
              device text NOT NULL DEFAULT 'mobile',
              path text NOT NULL,
              route_name text,
              score_performance real,
              score_accessibility real,
              score_seo real,
              score_best_practices real,
              lcp real,
              cls real,
              inp real,
              fcp real,
              ttfb real,
              tbt real,
              si real,
              lighthouse_version text NOT NULL,
              captured_at text NOT NULL,
              lhr_blob_key text NOT NULL,
              report_blob_key text,
              PRIMARY KEY (scan_id, url, device),
              FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE cascade
            )
          `)
          db.exec(`
            INSERT INTO scan_routes (
              scan_id, url, device, path, route_name,
              score_performance, score_accessibility, score_seo, score_best_practices,
              lcp, cls, inp, fcp, ttfb, tbt, si,
              lighthouse_version, captured_at, lhr_blob_key, report_blob_key
            )
            SELECT
              scan_id, url, 'mobile', path, route_name,
              score_performance, score_accessibility, score_seo, score_best_practices,
              lcp, cls, inp, fcp, ttfb, tbt, si,
              lighthouse_version, captured_at, lhr_blob_key, report_blob_key
            FROM scan_routes_d029_old
          `)
          db.exec(`DROP TABLE scan_routes_d029_old`)
          db.exec(`CREATE INDEX IF NOT EXISTS idx_scan_routes_scan_id ON scan_routes (scan_id)`)
        })
        migrate()
      }
      finally {
        db.pragma('foreign_keys = ON')
      }
    },
  },
]

// Columns added additively over the schema's life. INIT_SQL_STATEMENTS also
// carries ALTERs for these, but those run blind (errors swallowed) and a stale
// build or a forgotten ALTER can leave an existing DB missing one — which then
// crashes at INSERT time with a cryptic "table X has no column named Y"
// mid-scan. This list is the authoritative guard: checked (only ALTER when
// missing) and verified afterwards, so drift is healed loudly or escalated to
// a reset rather than surfacing as a runtime crash.
const ADDITIVE_COLUMNS: Array<{ table: string, column: string, ddl: string }> = [
  { table: 'scans', column: 'mode', ddl: 'ALTER TABLE `scans` ADD COLUMN `mode` text DEFAULT \'site\'' },
  { table: 'scans', column: 'site_id', ddl: 'ALTER TABLE `scans` ADD COLUMN `site_id` text REFERENCES `sites`(`id`) ON DELETE SET NULL' },
  { table: 'scan_routes', column: 'score_agentic_browsing', ddl: 'ALTER TABLE `scan_routes` ADD COLUMN `score_agentic_browsing` real' },
  { table: 'scan_routes', column: 'report_blob_key', ddl: 'ALTER TABLE `scan_routes` ADD COLUMN `report_blob_key` text' },
  { table: 'scan_routes', column: 'screenshot_blob_key', ddl: 'ALTER TABLE `scan_routes` ADD COLUMN `screenshot_blob_key` text' },
]

export interface EnsureSchemaOptions {
  /** Called when a missing column is added. */
  onAdd?: (col: string) => void
  /** Called when a column couldn't be added (will trigger a reset upstream). */
  onUnhealable?: (col: string, err: string) => void
}

/**
 * Verify the additive columns exist; add any that are missing. Returns the
 * columns that are STILL missing afterwards (an ALTER threw) — the caller
 * treats a non-empty result as an irreparably-stale DB and recreates it.
 * Idempotent + cheap (a PRAGMA per column), safe on every boot.
 */
export function ensureSchema(db: Database, opts: EnsureSchemaOptions = {}): string[] {
  const stillMissing: string[] = []
  for (const { table, column, ddl } of ADDITIVE_COLUMNS) {
    if (!tableExists(db, table))
      continue
    if (hasColumn(db, table, column))
      continue
    try {
      db.exec(ddl)
      opts.onAdd?.(`${table}.${column}`)
    }
    catch {
      // fall through to the post-check
    }
    if (!hasColumn(db, table, column)) {
      stillMissing.push(`${table}.${column}`)
      opts.onUnhealable?.(`${table}.${column}`, 'ALTER did not add the column')
    }
  }
  return stillMissing
}

interface ApplyMigrationsOptions {
  /** Called with each migration's id once it applies. Useful for logging. */
  onApply?: (id: string) => void
}

/**
 * Run every applicable migration against `db` in order. Cheap on the
 * already-current case (each `needs` check is a single PRAGMA / sqlite_master
 * lookup) so it's safe to call on every host boot.
 */
export function applyMigrations(db: Database, opts: ApplyMigrationsOptions = {}): void {
  for (const m of MIGRATIONS) {
    if (!m.needs(db))
      continue
    m.apply(db)
    opts.onApply?.(m.id)
  }
}
