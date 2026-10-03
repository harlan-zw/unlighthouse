import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '@unlighthouse/core/storage/drizzle'
import { expect, it } from 'vitest'

it('migrates existing route data using the runtime SQLite database', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE scans (scan_id TEXT PRIMARY KEY);
      INSERT INTO scans VALUES ('scan');
      CREATE TABLE scan_routes (
        scan_id TEXT, url TEXT, path TEXT, route_name TEXT,
        score_performance REAL, score_accessibility REAL, score_seo REAL, score_best_practices REAL,
        lcp REAL, cls REAL, inp REAL, fcp REAL, ttfb REAL, tbt REAL, si REAL,
        lighthouse_version TEXT, captured_at TEXT, lhr_blob_key TEXT, report_blob_key TEXT,
        PRIMARY KEY (scan_id, url)
      );
      INSERT INTO scan_routes (scan_id, url, path, score_performance, lighthouse_version, captured_at, lhr_blob_key)
      VALUES ('scan', 'http://localhost/', '/', 0.9, '13', '2026-10-03', 'blob');
    `)
    applyMigrations(db)
    expect(db.prepare('SELECT url, device, score_performance FROM scan_routes').get()).toEqual({
      url: 'http://localhost/',
      device: 'mobile',
      score_performance: 0.9,
    })
    applyMigrations(db)
    expect(db.prepare('SELECT COUNT(*) AS count FROM scan_routes').get()).toEqual({ count: 1 })
  }
  finally { db.close() }
})
