// v1 minimal schema. Mirrors the `Scan` and `ScanRoute` atoms from
// `@unlighthouse/contracts` at the storage layer. The drizzle table IS part of
// the contract: any storage adapter targeting SQL (better-sqlite3, node:sqlite,
// Cloudflare D1) imports these tables from here so all SQL backends share one
// schema definition.
//
// Lives at the `./drizzle` subpath so the default `@unlighthouse/contracts`
// import stays dependency-free (UI / MCP / Worker bundles never pull
// `drizzle-orm`).
//
// Coexists with the legacy v0 dashboard tables in
// `packages/core/src/storage/drizzle/schema/history.ts`. Those are
// implementation-private aggregations with no contract atom.
import type { Scan } from '../types/atoms'
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

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
 * Scan routes table — one row per (scanId, url). Mirrors `ScanRoute`,
 * which extends `ExtractedMetrics` with `scanId` + `lhrBlobKey`.
 *
 * Metric columns are flattened (not stored as JSON) because the comparison +
 * assertion engines do column-wise SQL aggregation.
 */
export const scanRoutes = sqliteTable(
  'scan_routes',
  {
    scanId: text('scan_id')
      .notNull()
      .references(() => scans.scanId, { onDelete: 'cascade' }),
    url: text('url').notNull(),
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
    lhrBlobKey: text('lhr_blob_key').notNull(),
  },
  table => [
    primaryKey({ columns: [table.scanId, table.url] }),
    index('idx_scan_routes_scan_id').on(table.scanId),
  ],
)

export type ScanRow = typeof scans.$inferSelect
export type ScanRowInsert = typeof scans.$inferInsert
export type ScanRouteRow = typeof scanRoutes.$inferSelect
export type ScanRouteRowInsert = typeof scanRoutes.$inferInsert
