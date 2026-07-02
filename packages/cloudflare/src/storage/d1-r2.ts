// Storage port composed from D1 (rows) + R2 (blobs).
// D1 is SQLite, so the schema in packages/core/migrations/sqlite/0000_init.sql
// applies verbatim — run `wrangler d1 migrations apply <db> --remote
// --migrations-dir <path-to-core/migrations/sqlite>` from your Worker project.

import type {
  D1Database,
  D1PreparedStatement,
  KVNamespace,
  R2Bucket,
} from '@cloudflare/workers-types'
import type { PackRun } from '@unlighthouse/contracts/packs'
import type {
  BlobPutOptions,
  BlobStore,
  ComparisonRepository,
  FindPreviousQuery,
  ListQuery,
  PackRunRepository,
  ReportRepositories,
  RouteListQuery,
  ScanInsert,
  ScanRepository,
  ScanRouteRepository,
  SiteRecord,
  SiteRepository,
  Storage,
} from '@unlighthouse/contracts/ports'
import type {
  Device,
  ExtractedMetrics,
  Paginated,
  Scan,
  ScanId,
  ScanRoute,
  ScanStatus,
  ScanSummary,
} from '@unlighthouse/contracts/types/atoms'
// Reports (CrUX) + comparisons are REAL drizzle repositories: D1 speaks the
// same sqlite dialect the shared `@unlighthouse/contracts/drizzle` schema
// targets, so the Cloudflare host reuses the exact query code the better-sqlite3
// host runs instead of re-implementing it. `db` is exposed so the on-demand
// comparison writer (`compareScans`) and CrUX enrichment operate over D1 too.
import {
  asDrizzleDatabase,
  createComparisonRepository,
  createReportRepositories,
} from '@unlighthouse/core/storage/drizzle'
import { drizzle } from 'drizzle-orm/d1'

// Re-export the contract type to keep the surface narrow.
export type { BlobStore }

export interface D1R2StorageOptions {
  db: D1Database
  bucket: R2Bucket
  kv?: KVNamespace
}

const DEFAULT_PAGE_SIZE = 50
const DEFAULT_ROUTE_PAGE_SIZE = 100

const SCAN_COLS = 'scan_id, site, device, status, started_at, completed_at, ci_branch, ci_commit, ci_commit_message, summary'
const ROUTE_COLS = 'scan_id, url, device, path, route_name, score_performance, score_accessibility, score_seo, score_best_practices, lcp, cls, inp, fcp, ttfb, tbt, si, lighthouse_version, captured_at, lhr_blob_key'

// Raw row shapes returned by D1.
interface ScanRawRow {
  scan_id: string
  site: string
  device: string
  status: string
  started_at: string
  completed_at: string | null
  ci_branch: string | null
  ci_commit: string | null
  ci_commit_message: string | null
  summary: string | null
}

interface RouteRawRow {
  scan_id: string
  url: string
  device: string
  path: string
  route_name: string | null
  score_performance: number | null
  score_accessibility: number | null
  score_seo: number | null
  score_best_practices: number | null
  lcp: number | null
  cls: number | null
  inp: number | null
  fcp: number | null
  ttfb: number | null
  tbt: number | null
  si: number | null
  lighthouse_version: string
  captured_at: string
  lhr_blob_key: string
}

function rowToScan(r: ScanRawRow): Scan {
  return {
    scanId: r.scan_id as ScanId,
    // siteId/mode were added to the Scan contract after this D1 schema was
    // written. Rather than a schema migration, derive them: siteId is the site
    // origin (the registry key the dashboard groups by) and mode defaults to a
    // full-site crawl — the only mode this worker drives.
    siteId: originOf(r.site),
    site: r.site,
    mode: 'site',
    device: r.device as Scan['device'],
    status: r.status as ScanStatus,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    ciBranch: r.ci_branch,
    ciCommit: r.ci_commit,
    ciCommitMessage: r.ci_commit_message,
    // summary is stored as JSON-encoded text (sqlite has no native JSON).
    summary: r.summary ? (JSON.parse(r.summary) as ScanSummary) : null,
  }
}

// Best-effort origin for siteId. Falls back to the raw value if not a URL.
function originOf(site: string): string {
  try {
    return new URL(site).origin
  }
  catch (_err) {
    // Site identifiers may be bare hosts or labels; fall back to the stored value.
    return site
  }
}

function rowToRoute(r: RouteRawRow): ScanRoute {
  return {
    scanId: r.scan_id as ScanId,
    url: r.url,
    device: (r.device ?? 'mobile') as ScanRoute['device'],
    path: r.path,
    routeName: r.route_name,
    scorePerformance: r.score_performance,
    scoreAccessibility: r.score_accessibility,
    scoreSeo: r.score_seo,
    scoreBestPractices: r.score_best_practices,
    lcp: r.lcp,
    cls: r.cls,
    inp: r.inp,
    fcp: r.fcp,
    ttfb: r.ttfb,
    tbt: r.tbt,
    si: r.si,
    lighthouseVersion: r.lighthouse_version,
    capturedAt: r.captured_at,
    lhrBlobKey: r.lhr_blob_key,
    reportBlobKey: (r as { report_blob_key?: string | null }).report_blob_key ?? null,
  }
}

// sha1 via Web Crypto (Workers runtime), trimmed to 16 hex chars to match
// the node:crypto version in the drizzle route repo.
async function urlHash(url: string): Promise<string> {
  const buf = new TextEncoder().encode(url)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < bytes.length; i++)
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0')
  return hex.slice(0, 16)
}

async function blobKeyFor(scanId: string, url: string, device: Device): Promise<string> {
  // D-029: per-device blob key. Device segment is appended to the filename
  // so the same URL on mobile + desktop coexist under their own keys.
  return `scans/${scanId}/lhr/${await urlHash(url)}-${device}.json.gz`
}

// Translate a partial ScanInsert into (set-clause-fragment, bind-values).
function buildUpdateClause(patch: Partial<ScanInsert>): { setSql: string, args: unknown[] } {
  const cols: string[] = []
  const args: unknown[] = []
  const map: Record<string, string> = {
    site: 'site',
    device: 'device',
    status: 'status',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    ciBranch: 'ci_branch',
    ciCommit: 'ci_commit',
    ciCommitMessage: 'ci_commit_message',
    summary: 'summary',
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'scanId')
      continue
    const col = map[k]
    if (!col)
      continue
    cols.push(`${col} = ?`)
    if (k === 'summary')
      args.push(v == null ? null : JSON.stringify(v))
    else
      args.push(v === undefined ? null : v)
  }
  return { setSql: cols.join(', '), args }
}

interface SiteRawRow {
  id: string
  name: string
  url: string
  group: string | null
  created_at: string
}

function rowToSite(r: SiteRawRow): SiteRecord {
  return { id: r.id, name: r.name, url: r.url, group: r.group, createdAt: r.created_at }
}

// Site registry (the user's saved sites the dashboard groups scans under).
// Added to the storage contract in v1; mirrors the core drizzle repository.
function d1SiteRepository(db: D1Database): SiteRepository {
  return {
    async list(): Promise<SiteRecord[]> {
      const res = await db.prepare(`SELECT * FROM sites ORDER BY created_at DESC`).all<SiteRawRow>()
      return (res.results ?? []).map(rowToSite)
    },
    async get(id: string): Promise<SiteRecord | null> {
      const r = await db.prepare(`SELECT * FROM sites WHERE id = ?`).bind(id).first<SiteRawRow>()
      return r ? rowToSite(r) : null
    },
    async getByUrl(url: string): Promise<SiteRecord | null> {
      const r = await db.prepare(`SELECT * FROM sites WHERE url = ?`).bind(url).first<SiteRawRow>()
      return r ? rowToSite(r) : null
    },
    async create(site: SiteRecord): Promise<SiteRecord> {
      await db
        .prepare(`INSERT INTO sites (id, name, url, "group", created_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(site.id, site.name, site.url, site.group, site.createdAt)
        .run()
      return site
    },
    async update(id: string, patch: Partial<Omit<SiteRecord, 'id'>>): Promise<SiteRecord | null> {
      const cols: string[] = []
      const args: unknown[] = []
      if (patch.name !== undefined) {
        cols.push(`name = ?`)
        args.push(patch.name)
      }
      if (patch.url !== undefined) {
        cols.push(`url = ?`)
        args.push(patch.url)
      }
      if (patch.group !== undefined) {
        cols.push(`"group" = ?`)
        args.push(patch.group)
      }
      if (patch.createdAt !== undefined) {
        cols.push(`created_at = ?`)
        args.push(patch.createdAt)
      }
      if (cols.length) {
        await db.prepare(`UPDATE sites SET ${cols.join(', ')} WHERE id = ?`).bind(...args, id).run()
      }
      return this.get(id)
    },
    async delete(id: string): Promise<boolean> {
      const res = await db.prepare(`DELETE FROM sites WHERE id = ?`).bind(id).run()
      return (res.meta?.changes ?? 0) > 0
    },
  }
}

function d1ScanRepository(db: D1Database): ScanRepository {
  return {
    async create(scan: ScanInsert): Promise<Scan> {
      const row: ScanRawRow = {
        scan_id: scan.scanId,
        site: scan.site,
        device: scan.device,
        status: scan.status,
        started_at: scan.startedAt,
        completed_at: scan.completedAt ?? null,
        ci_branch: scan.ciBranch ?? null,
        ci_commit: scan.ciCommit ?? null,
        ci_commit_message: scan.ciCommitMessage ?? null,
        summary: scan.summary ? JSON.stringify(scan.summary) : null,
      }
      await db
        .prepare(`INSERT INTO scans (${SCAN_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          row.scan_id,
          row.site,
          row.device,
          row.status,
          row.started_at,
          row.completed_at,
          row.ci_branch,
          row.ci_commit,
          row.ci_commit_message,
          row.summary,
        )
        .run()
      return rowToScan(row)
    },

    async get(scanId: ScanId): Promise<Scan | null> {
      const row = await db
        .prepare(`SELECT ${SCAN_COLS} FROM scans WHERE scan_id = ? LIMIT 1`)
        .bind(scanId)
        .first<ScanRawRow>()
      return row ? rowToScan(row) : null
    },

    async update(scanId: ScanId, patch: Partial<ScanInsert>): Promise<Scan> {
      const { setSql, args } = buildUpdateClause(patch)
      if (setSql) {
        await db
          .prepare(`UPDATE scans SET ${setSql} WHERE scan_id = ?`)
          .bind(...args, scanId)
          .run()
      }
      const row = await db
        .prepare(`SELECT ${SCAN_COLS} FROM scans WHERE scan_id = ? LIMIT 1`)
        .bind(scanId)
        .first<ScanRawRow>()
      if (!row)
        throw new Error(`Scan not found: ${scanId}`)
      return rowToScan(row)
    },

    async findPrevious(q: FindPreviousQuery): Promise<Scan | null> {
      const where: string[] = ['site = ?', 'device = ?', 'status = ?']
      const args: unknown[] = [q.site, q.device, 'complete']
      if (q.branch !== undefined) {
        where.push('ci_branch = ?')
        args.push(q.branch)
      }
      if (q.excludeScanId !== undefined) {
        where.push('scan_id != ?')
        args.push(q.excludeScanId)
      }
      const row = await db
        .prepare(`SELECT ${SCAN_COLS} FROM scans WHERE ${where.join(' AND ')} ORDER BY started_at DESC, created_at_ms DESC LIMIT 1`)
        .bind(...args)
        .first<ScanRawRow>()
      return row ? rowToScan(row) : null
    },

    async list(q: ListQuery): Promise<Paginated<Scan>> {
      const page = Math.max(1, q.page ?? 1)
      const pageSize = Math.max(1, q.pageSize ?? DEFAULT_PAGE_SIZE)
      const offset = (page - 1) * pageSize

      const where: string[] = []
      const args: unknown[] = []
      if (q.site) {
        where.push('site = ?')
        args.push(q.site)
      }
      if (q.device) {
        where.push('device = ?')
        args.push(q.device)
      }
      if (q.branch) {
        where.push('ci_branch = ?')
        args.push(q.branch)
      }
      if (q.status) {
        where.push('status = ?')
        args.push(q.status)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const [itemsRes, countRes] = await db.batch<unknown>([
        db
          .prepare(`SELECT ${SCAN_COLS} FROM scans ${whereSql} ORDER BY started_at DESC, created_at_ms DESC LIMIT ? OFFSET ?`)
          .bind(...args, pageSize, offset),
        db
          .prepare(`SELECT count(*) AS count FROM scans ${whereSql}`)
          .bind(...args),
      ])
      const items = ((itemsRes as { results: ScanRawRow[] }).results ?? []).map(rowToScan)
      const total = Number((countRes as { results: { count: number }[] }).results?.[0]?.count ?? 0)
      return { items, total, page, pageSize }
    },

    async delete(scanId: ScanId): Promise<void> {
      await db.prepare('DELETE FROM scans WHERE scan_id = ?').bind(scanId).run()
    },
  }
}

function metricsBindings(scanId: string, device: Device, m: ExtractedMetrics, lhrBlobKey: string): unknown[] {
  return [
    scanId,
    m.url,
    device,
    m.path,
    m.routeName,
    m.scorePerformance,
    m.scoreAccessibility,
    m.scoreSeo,
    m.scoreBestPractices,
    m.lcp,
    m.cls,
    m.inp,
    m.fcp,
    m.ttfb,
    m.tbt,
    m.si,
    m.lighthouseVersion,
    m.capturedAt,
    lhrBlobKey,
  ]
}

const ROUTE_UPSERT_SQL = `INSERT INTO scan_routes (${ROUTE_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(scan_id, url, device) DO UPDATE SET
  path = excluded.path,
  route_name = excluded.route_name,
  score_performance = excluded.score_performance,
  score_accessibility = excluded.score_accessibility,
  score_seo = excluded.score_seo,
  score_best_practices = excluded.score_best_practices,
  lcp = excluded.lcp,
  cls = excluded.cls,
  inp = excluded.inp,
  fcp = excluded.fcp,
  ttfb = excluded.ttfb,
  tbt = excluded.tbt,
  si = excluded.si,
  lighthouse_version = excluded.lighthouse_version,
  captured_at = excluded.captured_at,
  lhr_blob_key = excluded.lhr_blob_key`

function d1ScanRouteRepository(db: D1Database): ScanRouteRepository {
  return {
    async putBatch(scanId: ScanId, device: Device, rows: ExtractedMetrics[]): Promise<void> {
      if (rows.length === 0)
        return
      const stmts: D1PreparedStatement[] = []
      for (const m of rows) {
        const key = await blobKeyFor(scanId, m.url, device)
        stmts.push(db.prepare(ROUTE_UPSERT_SQL).bind(...metricsBindings(scanId, device, m, key)))
      }
      // D1.batch is atomic (auto-wrapped in a transaction).
      await db.batch(stmts)
    },

    async upsert(scanId: ScanId, device: Device, row: ExtractedMetrics): Promise<void> {
      const key = await blobKeyFor(scanId, row.url, device)
      await db
        .prepare(ROUTE_UPSERT_SQL)
        .bind(...metricsBindings(scanId, device, row, key))
        .run()
    },

    async listForScan(scanId: ScanId, q?: RouteListQuery): Promise<Paginated<ScanRoute>> {
      const page = Math.max(1, q?.page ?? 1)
      const pageSize = Math.max(1, q?.pageSize ?? DEFAULT_ROUTE_PAGE_SIZE)
      const offset = (page - 1) * pageSize
      const where: string[] = ['scan_id = ?']
      const args: unknown[] = [scanId]
      if (q?.device) {
        where.push('device = ?')
        args.push(q.device)
      }
      // Filter / sort push-down — mirrors the drizzle adapter so the
      // application-side fallback in api/handlers/scan.ts and query.ts
      // can stay identical between hosts.
      if (q?.filter?.minScore) {
        const map: Record<string, string> = {
          'performance': 'score_performance',
          'accessibility': 'score_accessibility',
          'seo': 'score_seo',
          'best-practices': 'score_best_practices',
        }
        for (const [cat, min] of Object.entries(q.filter.minScore)) {
          const col = map[cat]
          if (col && typeof min === 'number') {
            where.push(`${col} IS NOT NULL AND ${col} >= ?`)
            args.push(min)
          }
        }
      }
      if (q?.filter?.maxMetric) {
        const allowed = new Set(['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'])
        for (const [metric, max] of Object.entries(q.filter.maxMetric)) {
          if (allowed.has(metric) && typeof max === 'number') {
            // Null columns match (matches the JS-fallback semantics).
            where.push(`(${metric} IS NULL OR ${metric} <= ?)`)
            args.push(max)
          }
        }
      }
      if (q?.filter?.urlPattern) {
        where.push('url LIKE ?')
        args.push(`%${q.filter.urlPattern}%`)
      }
      const whereSql = where.join(' AND ')

      let orderBy = ''
      switch (q?.sort) {
        case 'score-asc': orderBy = 'ORDER BY score_performance ASC'
          break
        case 'score-desc': orderBy = 'ORDER BY score_performance DESC'
          break
        case 'lcp-asc': orderBy = 'ORDER BY lcp ASC'
          break
        case 'lcp-desc': orderBy = 'ORDER BY lcp DESC'
          break
        case 'url-asc': orderBy = 'ORDER BY url ASC'
          break
        case 'capturedAt-desc': orderBy = 'ORDER BY captured_at DESC'
          break
      }

      const [itemsRes, countRes] = await db.batch<unknown>([
        db
          .prepare(`SELECT ${ROUTE_COLS} FROM scan_routes WHERE ${whereSql} ${orderBy} LIMIT ? OFFSET ?`)
          .bind(...args, pageSize, offset),
        db
          .prepare(`SELECT count(*) AS count FROM scan_routes WHERE ${whereSql}`)
          .bind(...args),
      ])
      const items = ((itemsRes as { results: RouteRawRow[] }).results ?? []).map(rowToRoute)
      const total = Number((countRes as { results: { count: number }[] }).results?.[0]?.count ?? 0)
      return { items, total, page, pageSize }
    },

    async get(scanId: ScanId, url: string, device: Device): Promise<ScanRoute | null> {
      const row = await db
        .prepare(`SELECT ${ROUTE_COLS} FROM scan_routes WHERE scan_id = ? AND url = ? AND device = ? LIMIT 1`)
        .bind(scanId, url, device)
        .first<RouteRawRow>()
      return row ? rowToRoute(row) : null
    },

    async delete(scanId: ScanId, url?: string, device?: Device): Promise<void> {
      if (url && device) {
        await db
          .prepare('DELETE FROM scan_routes WHERE scan_id = ? AND url = ? AND device = ?')
          .bind(scanId, url, device)
          .run()
      }
      else if (url) {
        // Drop every device row for this URL.
        await db
          .prepare('DELETE FROM scan_routes WHERE scan_id = ? AND url = ?')
          .bind(scanId, url)
          .run()
      }
      else {
        await db.prepare('DELETE FROM scan_routes WHERE scan_id = ?').bind(scanId).run()
      }
    },
  }
}

interface PackRunRawRow {
  scan_id: string
  pack_name: string
  pack_version: string
  started_at: string
  completed_at: string
  report: string | null
  report_blob_key: string | null
}

function rowToPackRun(r: PackRunRawRow): PackRun {
  return {
    scanId: r.scan_id as ScanId,
    packName: r.pack_name,
    packVersion: r.pack_version,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    // sqlite has no native JSON column; the row stores a JSON string. Parse
    // here so the contract type stays `unknown` (i.e. the parsed value).
    report: r.report == null ? null : JSON.parse(r.report),
    reportBlobKey: r.report_blob_key,
  }
}

function d1PackRunRepository(db: D1Database): PackRunRepository {
  const COLS = 'scan_id, pack_name, pack_version, started_at, completed_at, report, report_blob_key'
  return {
    async get(scanId, packName, packVersion) {
      const row = await db
        .prepare(`SELECT ${COLS} FROM pack_runs WHERE scan_id = ? AND pack_name = ? AND pack_version = ? LIMIT 1`)
        .bind(scanId, packName, packVersion)
        .first<PackRunRawRow>()
      return row ? rowToPackRun(row) : null
    },

    async put(run) {
      const reportJson = run.report == null ? null : JSON.stringify(run.report)
      await db
        .prepare(`INSERT INTO pack_runs (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(scan_id, pack_name, pack_version) DO UPDATE SET
  started_at = excluded.started_at,
  completed_at = excluded.completed_at,
  report = excluded.report,
  report_blob_key = excluded.report_blob_key`)
        .bind(
          run.scanId,
          run.packName,
          run.packVersion,
          run.startedAt,
          run.completedAt,
          reportJson,
          run.reportBlobKey ?? null,
        )
        .run()
    },

    async listForScan(scanId) {
      const res = await db
        .prepare(`SELECT ${COLS} FROM pack_runs WHERE scan_id = ?`)
        .bind(scanId)
        .all<PackRunRawRow>()
      return (res.results ?? []).map(rowToPackRun)
    },

    async delete(scanId, packName) {
      if (packName) {
        await db.prepare('DELETE FROM pack_runs WHERE scan_id = ? AND pack_name = ?').bind(scanId, packName).run()
      }
      else {
        await db.prepare('DELETE FROM pack_runs WHERE scan_id = ?').bind(scanId).run()
      }
    },
  }
}

function r2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async put(key: string, data: Uint8Array, opts?: BlobPutOptions) {
      // R2 has no native object TTL. We stamp `expiresAt` (ms since epoch)
      // into customMetadata when the caller asks for one, and ship a
      // separate Cron-triggered sweeper Worker (see ./sweeper.ts) that
      // lists + deletes expired objects on a schedule. Without the sweeper
      // active, expiresAt is observational metadata — same UX you'd get
      // from R2's built-in object expiry once that lands.
      const customMetadata: Record<string, string> | undefined = opts?.ttl
        ? { expiresAt: String(Date.now() + opts.ttl * 1000) }
        : undefined
      await bucket.put(key, data as Uint8Array, {
        httpMetadata: opts?.contentType ? { contentType: opts.contentType } : undefined,
        customMetadata,
      })
    },
    async get(key: string) {
      const obj = await bucket.get(key)
      if (!obj)
        return null
      const buf = await obj.arrayBuffer()
      return new Uint8Array(buf)
    },
    async has(key: string) {
      const head = await bucket.head(key)
      return head != null
    },
    async delete(key: string) {
      await bucket.delete(key)
    },
    async list(prefix: string): Promise<string[]> {
      // R2 list is paginated (1000 objects/page). Walk the cursor so retention
      // pruning enumerates every namespaced blob, not just the first page.
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const listing = await bucket.list({ prefix, cursor })
        for (const obj of listing.objects)
          keys.push(obj.key)
        cursor = listing.truncated ? listing.cursor : undefined
      } while (cursor)
      return keys
    },
  }
}

// One-shot schema bootstrap for tests / local dev. Production users should
// run `wrangler d1 migrations apply` against packages/core/migrations/sqlite.
const INIT_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS sites (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    "group" text,
    created_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS scans (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scans_site ON scans (site)`,
  `CREATE INDEX IF NOT EXISTS idx_scans_status ON scans (status)`,
  `CREATE INDEX IF NOT EXISTS idx_scans_started_at ON scans (started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_scans_find_previous ON scans (site, device, ci_branch, started_at)`,
  // Full column set from the shared `@unlighthouse/contracts/drizzle` schema so
  // any drizzle read over `scan_routes` (e.g. `compareScans`) runs on D1. The
  // raw-SQL route writer here populates the core metric columns; the additive
  // provenance/blob-key columns default null until the D-034/D-040 row writer
  // reaches the D1 path.
  `CREATE TABLE IF NOT EXISTS scan_routes (
    scan_id text NOT NULL,
    url text NOT NULL,
    device text NOT NULL DEFAULT 'mobile',
    path text NOT NULL,
    route_name text,
    score_performance real,
    score_accessibility real,
    score_seo real,
    score_best_practices real,
    score_agentic_browsing real,
    lcp real,
    cls real,
    inp real,
    fcp real,
    ttfb real,
    tbt real,
    si real,
    lighthouse_version text NOT NULL,
    auditor text,
    captured_at text NOT NULL,
    lhr_blob_key text NOT NULL,
    report_blob_key text,
    screenshot_blob_key text,
    PRIMARY KEY (scan_id, url, device),
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scan_routes_scan_id ON scan_routes (scan_id)`,
  `CREATE TABLE IF NOT EXISTS pack_runs (
    scan_id text NOT NULL,
    pack_name text NOT NULL,
    pack_version text NOT NULL,
    started_at text NOT NULL,
    completed_at text NOT NULL,
    report text,
    report_blob_key text,
    PRIMARY KEY (scan_id, pack_name, pack_version),
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pack_runs_scan_id ON pack_runs (scan_id)`,
  // Comparison tables — mirrors `@unlighthouse/contracts/drizzle` so the shared
  // drizzle comparison repository reads/writes them verbatim on D1. Populated
  // on demand by `compareScans` (the CI/agent comparison persist path).
  `CREATE TABLE IF NOT EXISTS comparisons (
    id integer PRIMARY KEY AUTOINCREMENT,
    base_scan_id text REFERENCES scans(scan_id) ON DELETE CASCADE,
    current_scan_id text REFERENCES scans(scan_id) ON DELETE CASCADE,
    improved integer NOT NULL DEFAULT 0,
    regressed integer NOT NULL DEFAULT 0,
    unchanged integer NOT NULL DEFAULT 0,
    new_urls integer NOT NULL DEFAULT 0,
    removed_urls integer NOT NULL DEFAULT 0,
    created_at integer DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS comparison_diffs (
    id integer PRIMARY KEY AUTOINCREMENT,
    comparison_id integer REFERENCES comparisons(id) ON DELETE CASCADE,
    path text NOT NULL,
    url text NOT NULL,
    metric_diffs text NOT NULL,
    severity text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comparisons_scans ON comparisons (base_scan_id, current_scan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_diffs_comparison ON comparison_diffs (comparison_id)`,
  // CrUX field data (external source, not derived from LHR) — the only surviving
  // ReportRepositories member after the dashboard aggregation tables were removed.
  `CREATE TABLE IF NOT EXISTS scan_crux (
    id integer PRIMARY KEY AUTOINCREMENT,
    scan_id text NOT NULL REFERENCES scans(scan_id) ON DELETE CASCADE,
    hostname text NOT NULL,
    form_factor text NOT NULL,
    series_json text NOT NULL,
    fetched_at integer NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scan_crux_scan ON scan_crux (scan_id, form_factor)`,
]

export async function migrate(db: D1Database): Promise<void> {
  await db.batch(INIT_SQL.map(sql => db.prepare(sql)))
}

export function d1R2Storage(opts: D1R2StorageOptions): Storage {
  // Reports (CrUX) + comparisons are real drizzle repositories over the D1
  // handle — D1 is sqlite, so the shared `@unlighthouse/contracts/drizzle`
  // schema and the better-sqlite3 host's query code apply verbatim. `db` is the
  // raw drizzle handle the on-demand comparison writer (`compareScans`) and CrUX
  // enrichment use; going through it keeps the Worker host at full parity with
  // the CLI host rather than degrading to "no detail data".
  const ddb = drizzle(opts.db as unknown as Parameters<typeof drizzle>[0])
  const drizzleDb = asDrizzleDatabase(ddb)
  return {
    sites: d1SiteRepository(opts.db),
    scans: d1ScanRepository(opts.db),
    routes: d1ScanRouteRepository(opts.db),
    blobs: r2BlobStore(opts.bucket),
    reports: createReportRepositories(drizzleDb) as ReportRepositories,
    comparisons: createComparisonRepository(drizzleDb) as unknown as ComparisonRepository,
    packRuns: d1PackRunRepository(opts.db),
    db: ddb,
  }
}
