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
import type {
  BlobPutOptions,
  BlobStore,
  Device,
  ExtractedMetrics,
  FindPreviousQuery,
  ListQuery,
  PackRun,
  PackRunRepository,
  Paginated,
  RouteListQuery,
  Scan,
  ScanId,
  ScanInsert,
  ScanRepository,
  ScanRoute,
  ScanRouteRepository,
  ScanStatus,
  ScanSummary,
  Storage,
} from '@unlighthouse/contracts'

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
    site: r.site,
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
    hex += bytes[i].toString(16).padStart(2, '0')
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
        case 'score-asc': orderBy = 'ORDER BY score_performance ASC'; break
        case 'score-desc': orderBy = 'ORDER BY score_performance DESC'; break
        case 'lcp-asc': orderBy = 'ORDER BY lcp ASC'; break
        case 'lcp-desc': orderBy = 'ORDER BY lcp DESC'; break
        case 'url-asc': orderBy = 'ORDER BY url ASC'; break
        case 'capturedAt-desc': orderBy = 'ORDER BY captured_at DESC'; break
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
      await bucket.put(key, data as Uint8Array, {
        httpMetadata: opts?.contentType ? { contentType: opts.contentType } : undefined,
        // TODO(v5): R2 has no native ttl; track expiry via customMetadata + a sweeper Worker.
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
  }
}

// One-shot schema bootstrap for tests / local dev. Production users should
// run `wrangler d1 migrations apply` against packages/core/migrations/sqlite.
const INIT_SQL: string[] = [
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
]

export async function migrate(db: D1Database): Promise<void> {
  await db.batch(INIT_SQL.map(sql => db.prepare(sql)))
}

export function d1R2Storage(opts: D1R2StorageOptions): Storage {
  // Report + comparison repos: D1 deployment doesn't run `processScanData`
  // (that lives in core/report and currently requires a sync drizzle handle).
  // Stub empty until a D1-native processor lands. Dashboards degrade to "no
  // detail data" on cloudflare; the contract atoms (`scans` + `scanRoutes`
  // + `summary` JSON) still serve.
  const emptyList = { list: async () => [] }
  return {
    scans: d1ScanRepository(opts.db),
    routes: d1ScanRouteRepository(opts.db),
    blobs: r2BlobStore(opts.bucket),
    reports: {
      accessibility: emptyList,
      accessibilityElements: emptyList,
      missingAltImages: emptyList,
      performance: emptyList,
      thirdPartyScripts: emptyList,
      lcpElements: emptyList,
      seoMeta: emptyList,
      seoDuplicates: emptyList,
      canonicalChains: emptyList,
      linkTextIssues: emptyList,
      tapTargetIssues: emptyList,
      bestPracticesSecurity: emptyList,
      bestPracticesLibraries: emptyList,
      bestPracticesVulnerable: emptyList,
      bestPracticesDeprecated: emptyList,
      bestPracticesConsoleErrors: emptyList,
      crux: emptyList,
      dashboardSummary: { get: async () => null },
    },
    comparisons: {
      async list() { return [] },
      async get() { return null },
      async latestForCurrent() { return null },
      async diffs() { return [] },
    },
    packRuns: d1PackRunRepository(opts.db),
  }
}
