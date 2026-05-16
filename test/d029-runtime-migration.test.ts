// D-029 runtime migration: existing sqlite databases from before the
// device column landed need an in-place upgrade. INIT_SQL_STATEMENTS uses
// `CREATE TABLE IF NOT EXISTS` and is a no-op against them; the migrations
// module owns the explicit upgrade path.
//
// This test stands up a synthetic "pre-D-029" database (scan_routes
// without a device column, PK on (scan_id, url) alone), runs the
// migration, and verifies the resulting shape + data preservation.

import Database from 'better-sqlite3'
import { applyMigrations } from '@unlighthouse/core/storage/drizzle'
import { describe, expect, it } from 'vitest'

function makeLegacyDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE scans (
      scan_id text PRIMARY KEY NOT NULL,
      site text NOT NULL,
      device text NOT NULL,
      status text NOT NULL,
      started_at text NOT NULL,
      completed_at text,
      ci_branch text,
      ci_commit text,
      ci_commit_message text,
      summary text,
      created_at_ms integer DEFAULT (unixepoch() * 1000) NOT NULL
    );
    CREATE TABLE scan_routes (
      scan_id text NOT NULL,
      url text NOT NULL,
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
      PRIMARY KEY (scan_id, url),
      FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE cascade
    );
    CREATE INDEX idx_scan_routes_scan_id ON scan_routes (scan_id);
  `)
  // Seed one scan + two routes.
  db.exec(`INSERT INTO scans (scan_id, site, device, status, started_at) VALUES ('s1', 'http://x', 'mobile', 'complete', '2025-01-01T00:00:00Z')`)
  db.exec(`INSERT INTO scan_routes (scan_id, url, path, score_performance, lighthouse_version, captured_at, lhr_blob_key) VALUES
    ('s1', 'http://x/a', '/a', 0.9, '12.0.0', '2025-01-01T00:00:00Z', 'k1'),
    ('s1', 'http://x/b', '/b', 0.8, '12.0.0', '2025-01-01T00:00:00Z', 'k2')`)
  return db
}

function cols(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(r => r.name)
}

function pkCols(db: Database.Database, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string, pk: number }>)
    .filter(r => r.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map(r => r.name)
}

describe('D-029 runtime migration', () => {
  it('adds the device column to a legacy scan_routes table', () => {
    const db = makeLegacyDb()
    expect(cols(db, 'scan_routes')).not.toContain('device')

    const applied: string[] = []
    applyMigrations(db, { onApply: id => applied.push(id) })

    expect(applied).toEqual(['d029-scan-routes-device-column'])
    expect(cols(db, 'scan_routes')).toContain('device')
  })

  it('widens the PK to (scan_id, url, device)', () => {
    const db = makeLegacyDb()
    expect(pkCols(db, 'scan_routes')).toEqual(['scan_id', 'url'])

    applyMigrations(db)

    expect(pkCols(db, 'scan_routes')).toEqual(['scan_id', 'url', 'device'])
  })

  it('preserves existing rows and stamps them with device=mobile', () => {
    const db = makeLegacyDb()
    applyMigrations(db)

    const rows = db.prepare(`SELECT scan_id, url, device, score_performance FROM scan_routes ORDER BY url`).all()
    expect(rows).toEqual([
      { scan_id: 's1', url: 'http://x/a', device: 'mobile', score_performance: 0.9 },
      { scan_id: 's1', url: 'http://x/b', device: 'mobile', score_performance: 0.8 },
    ])
  })

  it('is a no-op on an already-migrated database (idempotent)', () => {
    const db = makeLegacyDb()
    applyMigrations(db) // first run upgrades
    const applied: string[] = []
    applyMigrations(db, { onApply: id => applied.push(id) }) // second run = no-op
    expect(applied).toEqual([])
  })

  it('is a no-op on a fresh database that already has the device column', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE scans (
        scan_id text PRIMARY KEY NOT NULL,
        site text NOT NULL,
        device text NOT NULL,
        status text NOT NULL,
        started_at text NOT NULL,
        completed_at text,
        ci_branch text,
        ci_commit text,
        ci_commit_message text,
        summary text,
        created_at_ms integer DEFAULT (unixepoch() * 1000) NOT NULL
      );
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
      );
    `)
    const applied: string[] = []
    applyMigrations(db, { onApply: id => applied.push(id) })
    expect(applied).toEqual([])
  })

  it('survives an empty pre-D-029 scan_routes table (no rows)', () => {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE scans (scan_id text PRIMARY KEY NOT NULL, site text NOT NULL, device text NOT NULL, status text NOT NULL, started_at text NOT NULL, completed_at text, ci_branch text, ci_commit text, ci_commit_message text, summary text, created_at_ms integer DEFAULT (unixepoch() * 1000) NOT NULL);
      CREATE TABLE scan_routes (
        scan_id text NOT NULL,
        url text NOT NULL,
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
        PRIMARY KEY (scan_id, url),
        FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE cascade
      );
    `)
    applyMigrations(db)
    expect(cols(db, 'scan_routes')).toContain('device')
    expect(pkCols(db, 'scan_routes')).toEqual(['scan_id', 'url', 'device'])
    expect(db.prepare(`SELECT count(*) as n FROM scan_routes`).get()).toEqual({ n: 0 })
  })
})
