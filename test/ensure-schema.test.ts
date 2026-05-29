// ensureSchema heals an on-disk DB that predates an additive column, so a
// stale `.unlighthouse/db.sqlite` self-upgrades instead of crashing mid-scan
// with "table scan_routes has no column named score_agentic_browsing".

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ensureSchema } from '../packages/core/src/storage/drizzle/migrations'

// An old scan_routes/scans/sites schema, missing the additive columns added
// over time (score_agentic_browsing, report_blob_key, screenshot_blob_key,
// scans.mode, scans.site_id).
function oldSchema(db: Database.Database) {
  db.exec(`CREATE TABLE sites (id text PRIMARY KEY, name text NOT NULL, url text NOT NULL, "group" text, created_at text NOT NULL)`)
  db.exec(`CREATE TABLE scans (scan_id text PRIMARY KEY, site text NOT NULL, device text NOT NULL, status text NOT NULL, started_at text NOT NULL)`)
  db.exec(`CREATE TABLE scan_routes (
    scan_id text NOT NULL, url text NOT NULL, device text NOT NULL DEFAULT 'mobile',
    path text NOT NULL, route_name text,
    score_performance real, score_accessibility real, score_seo real, score_best_practices real,
    lcp real, cls real, inp real, fcp real, ttfb real, tbt real, si real,
    lighthouse_version text NOT NULL, captured_at text NOT NULL, lhr_blob_key text NOT NULL,
    PRIMARY KEY (scan_id, url, device)
  )`)
}

const has = (db: Database.Database, table: string, col: string): boolean =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(r => r.name === col)

describe('ensureSchema', () => {
  it('adds the missing additive columns to a stale DB', () => {
    const db = new Database(':memory:')
    oldSchema(db)
    expect(has(db, 'scan_routes', 'score_agentic_browsing')).toBe(false)

    const added: string[] = []
    const stillMissing = ensureSchema(db, { onAdd: c => added.push(c) })

    expect(stillMissing).toEqual([])
    expect(has(db, 'scan_routes', 'score_agentic_browsing')).toBe(true)
    expect(has(db, 'scan_routes', 'report_blob_key')).toBe(true)
    expect(has(db, 'scan_routes', 'screenshot_blob_key')).toBe(true)
    expect(has(db, 'scans', 'mode')).toBe(true)
    expect(has(db, 'scans', 'site_id')).toBe(true)
    expect(added).toContain('scan_routes.score_agentic_browsing')
  })

  it('is an idempotent no-op once the columns exist', () => {
    const db = new Database(':memory:')
    oldSchema(db)
    ensureSchema(db) // first pass heals
    const added: string[] = []
    const stillMissing = ensureSchema(db, { onAdd: c => added.push(c) })
    expect(stillMissing).toEqual([])
    expect(added).toEqual([])
  })

  it('skips tables that do not exist (fresh/empty DB)', () => {
    const db = new Database(':memory:')
    // no tables at all
    expect(ensureSchema(db)).toEqual([])
  })
})
