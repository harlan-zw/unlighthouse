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
