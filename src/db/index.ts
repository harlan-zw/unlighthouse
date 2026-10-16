import { Database } from 'bun:sqlite'
import type { SQLQueryBindings } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOP_ITEMS } from '../analysis/issues.ts'
import type { AuditResult, BrokenLink, FieldResult, HreflangProblem, IssuePage, NewPage, NewScan, PageQuery, Paged, ScanPatch, Store, TemplateCount } from '../contracts.ts'
import { hashUrl } from '../discover/urls.ts'
import { UnlighthouseError } from '../errors.ts'
import { CATEGORIES, METRICS } from '../types.ts'
import type { Category, Device, FieldRecord, FieldSource, Finding, Issue, IssueItem, Metrics, Page, PageStatus, Scan, ScanField, ScanStats, ScanStatus, Scores, Severity, Site } from '../types.ts'
import { flowQueries } from './flows.ts'
import { metricColumn, migrate, scoreColumn } from './migrations.ts'
import { monitorStore } from './monitoring.ts'

type Row = Record<string, unknown>
type Value = Exclude<SQLQueryBindings, Record<string, unknown>>
type Bindings = Record<string, Value>

const SCAN_SELECT = 'SELECT scans.*, sites.origin AS origin FROM scans JOIN sites ON sites.id = scans.site_id'

const EMPTY_STATS: ScanStats = { discovered: 0, queued: 0, done: 0, failed: 0, skipped: 0 }

const TERMINAL_PAGE_STATUSES: PageStatus[] = ['done', 'failed', 'skipped']

const ISSUE_FROM = 'FROM findings f JOIN pages p ON p.scan_id = f.scan_id AND p.url = f.url AND p.device = f.device'

const CRUX_CACHE_KEEP_MS = 7 * 24 * 60 * 60 * 1000

function sortColumn(sort: PageQuery['sort']): string {
  if (!sort || sort === 'url')
    return 'url'
  if (sort === 'template')
    return 'template'
  if ((CATEGORIES as readonly string[]).includes(sort))
    return scoreColumn(sort as Category)
  if ((METRICS as readonly string[]).includes(sort))
    return metricColumn(sort as keyof Metrics)
  throw new UnlighthouseError('INVALID_INPUT', `Unknown sort: ${sort}`)
}

function toScan(row: Row): Scan {
  return {
    id: row['id'] as string,
    siteId: row['site_id'] as number,
    origin: row['origin'] as string,
    status: row['status'] as ScanStatus,
    label: row['label'] as string | null,
    branch: row['branch'] as string | null,
    commit: row['commit'] as string | null,
    devices: JSON.parse(row['devices'] as string) as Device[],
    options: JSON.parse(row['options'] as string) as unknown,
    stats: JSON.parse(row['stats'] as string) as ScanStats,
    lighthouseVersion: row['lighthouse_version'] as string | null,
    error: row['error'] as string | null,
    createdAt: row['created_at'] as number,
    startedAt: row['started_at'] as number | null,
    finishedAt: row['finished_at'] as number | null,
  }
}

function toPage(row: Row): Page {
  const scores = {} as Scores
  for (const category of CATEGORIES)
    scores[category] = row[scoreColumn(category)] as number | null
  const metrics = {} as Metrics
  for (const metric of METRICS)
    metrics[metric] = row[metricColumn(metric)] as number | null
  return {
    scanId: row['scan_id'] as string,
    url: row['url'] as string,
    path: row['path'] as string,
    template: row['template'] as string,
    device: row['device'] as Device,
    status: row['status'] as PageStatus,
    scores,
    metrics,
    finalUrl: row['final_url'] as string | null,
    statusCode: row['status_code'] as number | null,
    provenance: row['provenance'] === null ? null : JSON.parse(row['provenance'] as string),
    error: row['error'] as string | null,
    durationMs: row['duration_ms'] as number | null,
    finishedAt: row['finished_at'] as number | null,
  }
}

function toFinding(row: Row): Finding {
  return {
    auditId: row['audit_id'] as string,
    category: row['category'] as Category | null,
    title: row['title'] as string,
    severity: row['severity'] as Severity,
    score: row['score'] as number | null,
    displayValue: row['display_value'] as string | null,
    itemKey: row['item_key'] as string,
    itemLabel: row['item_label'] as string | null,
    savingsMs: row['savings_ms'] as number | null,
    savingsBytes: row['savings_bytes'] as number | null,
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

export function openStore(dataDir: string): Store {
  mkdirSync(dataDir, { recursive: true })
  const blobRoot = join(dataDir, 'blobs')
  const db = new Database(join(dataDir, 'unlighthouse.db'), { create: true, strict: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA busy_timeout = 5000')
  db.run('PRAGMA synchronous = NORMAL')
  migrate(db)

  const scanDir = (scanId: string) => join(blobRoot, scanId)
  const blobPath = (scanId: string, url: string, device: Device) => join(scanDir(scanId), `${hashUrl(url)}-${device}.json.gz`)
  const thumbnailPath = (scanId: string, url: string, device: Device) => join(scanDir(scanId), `${hashUrl(url)}-${device}.webp`)

  const all = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).all(bindings)
  const get = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).get(bindings)
  const run = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).run(bindings)

  function issueItemRows(scoped: string, bindings: Bindings, limit: number): IssueItem[] {
    return all(`SELECT f.item_key, max(f.item_label) AS item_label, count(DISTINCT f.url) AS pages,
        coalesce(sum(f.savings_ms), 0) AS item_ms, coalesce(sum(f.savings_bytes), 0) AS item_bytes
      ${scoped} AND f.item_key <> ''
      GROUP BY f.item_key
      ORDER BY item_ms / 1000.0 + item_bytes / 100000.0 DESC, pages DESC, f.item_key
      LIMIT $limit`, { ...bindings, limit })
      .map(row => ({
        key: row['item_key'] as string,
        label: row['item_label'] as string | null,
        pages: row['pages'] as number,
        savingsMs: row['item_ms'] as number,
        savingsBytes: row['item_bytes'] as number,
      }))
  }

  function getScan(id: string): Scan | null {
    const row = get(`${SCAN_SELECT} WHERE scans.id = $id`, { id })
    return row ? toScan(row) : null
  }

  function upsertSite(origin: string): Site {
    run('INSERT INTO sites (origin, created_at) VALUES ($origin, $now) ON CONFLICT(origin) DO NOTHING', { origin, now: Date.now() })
    const row = get('SELECT * FROM sites WHERE origin = $origin', { origin })!
    return { id: row['id'] as number, origin: row['origin'] as string, createdAt: row['created_at'] as number }
  }

  const removeScanRows = db.transaction((ids: string[]) => {
    for (const id of ids)
      run('DELETE FROM scans WHERE id = $id', { id })
  })

  function removeScans(ids: string[]): void {
    removeScanRows.immediate(ids)
    for (const id of ids)
      rmSync(scanDir(id), { recursive: true, force: true })
  }

  const savePage = db.transaction((scanId: string, url: string, device: Device, result: AuditResult) => {
    const bindings: Bindings = {
      scanId,
      url,
      device,
      finalUrl: result.finalUrl,
      statusCode: result.statusCode,
      provenance: JSON.stringify(result.provenance),
      durationMs: result.durationMs,
      now: Date.now(),
    }
    const sets: string[] = []
    for (const category of CATEGORIES) {
      sets.push(`${scoreColumn(category)} = $${scoreColumn(category)}`)
      bindings[scoreColumn(category)] = result.scores[category] ?? null
    }
    for (const metric of METRICS) {
      sets.push(`${metricColumn(metric)} = $${metricColumn(metric)}`)
      bindings[metricColumn(metric)] = result.metrics[metric] ?? null
    }
    const changes = run(`UPDATE pages SET status = 'done', ${sets.join(', ')}, final_url = $finalUrl, status_code = $statusCode,
      provenance = $provenance, error = NULL, duration_ms = $durationMs, finished_at = $now, rescan_previous = NULL
      WHERE scan_id = $scanId AND url = $url AND device = $device`, bindings)
    if (changes.changes === 0)
      throw new UnlighthouseError('NOT_FOUND', `Page not found: ${url} (${device}) in scan ${scanId}`)
    run('DELETE FROM findings WHERE scan_id = $scanId AND url = $url AND device = $device', { scanId, url, device })
    const insert = db.query<Row, Bindings>(`INSERT INTO findings
      (scan_id, url, device, audit_id, category, title, severity, score, display_value, item_key, item_label, savings_ms, savings_bytes)
      VALUES ($scanId, $url, $device, $auditId, $category, $title, $severity, $score, $displayValue, $itemKey, $itemLabel, $savingsMs, $savingsBytes)`)
    for (const finding of result.findings) {
      insert.run({
        scanId,
        url,
        device,
        auditId: finding.auditId,
        category: finding.category,
        title: finding.title,
        severity: finding.severity,
        score: finding.score,
        displayValue: finding.displayValue,
        itemKey: finding.itemKey,
        itemLabel: finding.itemLabel,
        savingsMs: finding.savingsMs,
        savingsBytes: finding.savingsBytes,
      })
    }
    const path = blobPath(scanId, url, device)
    mkdirSync(scanDir(scanId), { recursive: true })
    const temp = `${path}.${process.pid}.tmp`
    writeFileSync(temp, result.report)
    renameSync(temp, path)
    const thumbnail = thumbnailPath(scanId, url, device)
    if (result.thumbnail) {
      writeFileSync(`${thumbnail}.${process.pid}.tmp`, result.thumbnail)
      renameSync(`${thumbnail}.${process.pid}.tmp`, thumbnail)
    }
    else {
      rmSync(thumbnail, { force: true })
    }
  })

  function parseRecord(value: unknown): FieldRecord | null {
    return typeof value === 'string' ? JSON.parse(value) as FieldRecord : null
  }

  function originRecord(scanId: string, device: Device): FieldRecord | null {
    return parseRecord(get('SELECT record FROM scan_field WHERE scan_id = $scanId AND device = $device', { scanId, device })?.['record'])
  }

  const saveFieldRows = db.transaction((scanId: string, field: FieldResult) => {
    const now = Date.now()
    run('DELETE FROM scan_field WHERE scan_id = $scanId', { scanId })
    run('DELETE FROM page_field WHERE scan_id = $scanId', { scanId })
    for (const [device, record] of Object.entries(field.origin))
      run('INSERT INTO scan_field (scan_id, device, record, fetched_at) VALUES ($scanId, $device, $record, $now)', { scanId, device, record: record ? JSON.stringify(record) : null, now })
    const insert = db.query<Row, Bindings>(`INSERT INTO page_field (scan_id, url, device, source, record)
      SELECT $scanId, $url, $device, $source, $record WHERE EXISTS
        (SELECT 1 FROM pages WHERE scan_id = $scanId AND url = $url AND device = $device)`)
    for (const page of field.pages)
      insert.run({ scanId, url: page.url, device: page.device, source: page.source, record: page.source === 'url' && page.record ? JSON.stringify(page.record) : null })
  })

  const insertPageRows = db.transaction((scanId: string, pages: NewPage[]) => {
    const insert = db.query<Row, Bindings>(`INSERT INTO pages (scan_id, url, device, path, template, status, error)
      VALUES ($scanId, $url, $device, $path, $template, $status, $error) ON CONFLICT(scan_id, url, device) DO NOTHING`)
    for (const page of pages)
      insert.run({ scanId, url: page.url, device: page.device, path: page.path, template: page.template, status: page.status, error: page.reason ?? null })
  })

  return {
    ...flowQueries(db, scanDir),
    ...monitorStore(db),

    close() {
      db.close()
    },

    upsertSite,

    listSites() {
      const rows = all(`SELECT sites.*,
        (SELECT count(*) FROM scans WHERE scans.site_id = sites.id) AS scan_count,
        (SELECT id FROM scans WHERE scans.site_id = sites.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_scan_id
        FROM sites ORDER BY origin`)
      return rows.map(row => ({
        id: row['id'] as number,
        origin: row['origin'] as string,
        createdAt: row['created_at'] as number,
        scans: row['scan_count'] as number,
        lastScan: row['last_scan_id'] === null ? null : getScan(row['last_scan_id'] as string),
      }))
    },

    createScan(input: NewScan) {
      const site = upsertSite(input.origin)
      const id = Bun.randomUUIDv7()
      run(`INSERT INTO scans (id, site_id, status, label, branch, "commit", devices, options, stats, created_at)
        VALUES ($id, $siteId, 'queued', $label, $branch, $commit, $devices, $options, $stats, $now)`, {
        id,
        siteId: site.id,
        label: input.label ?? null,
        branch: input.branch ?? null,
        commit: input.commit ?? null,
        devices: JSON.stringify(input.devices),
        options: JSON.stringify(input.options ?? null),
        stats: JSON.stringify(EMPTY_STATS),
        now: Date.now(),
      })
      return getScan(id)!
    },

    getScan,

    listScans(query) {
      const where: string[] = []
      const bindings: Bindings = {}
      if (query.origin !== undefined) {
        where.push('sites.origin = $origin')
        bindings['origin'] = query.origin
      }
      if (query.status !== undefined) {
        where.push('scans.status = $status')
        bindings['status'] = query.status
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const total = get(`SELECT count(*) AS total FROM scans JOIN sites ON sites.id = scans.site_id${clause}`, bindings)!['total'] as number
      const items = all(`${SCAN_SELECT}${clause} ORDER BY scans.created_at DESC, scans.id DESC LIMIT $limit OFFSET $offset`, { ...bindings, limit: query.limit, offset: query.offset })
      return { items: items.map(toScan), total }
    },

    updateScan(id: string, patch: ScanPatch) {
      const sets: string[] = []
      const bindings: Bindings = { id }
      const columns: Array<[keyof ScanPatch, string, (value: never) => Value]> = [
        ['status', 'status', (value: string) => value],
        ['stats', 'stats', (value: ScanStats) => JSON.stringify(value)],
        ['lighthouseVersion', 'lighthouse_version', (value: string) => value],
        ['error', 'error', (value: string | null) => value],
        ['startedAt', 'started_at', (value: number) => value],
        ['finishedAt', 'finished_at', (value: number) => value],
        ['brokenLinks', 'broken_links', (value: BrokenLink[]) => JSON.stringify(value)],
        ['hreflangProblems', 'hreflang_problems', (value: HreflangProblem[]) => JSON.stringify(value)],
      ]
      for (const [key, column, encode] of columns) {
        if (patch[key] === undefined)
          continue
        sets.push(`${column} = $${column}`)
        bindings[column] = encode(patch[key] as never)
      }
      if (!sets.length)
        return
      if (run(`UPDATE scans SET ${sets.join(', ')} WHERE id = $id`, bindings).changes === 0)
        throw new UnlighthouseError('NOT_FOUND', `Scan not found: ${id}`)
    },

    deleteScan(id: string) {
      if (getScan(id))
        removeScans([id])
    },

    brokenLinks(scanId: string) {
      const row = get('SELECT broken_links FROM scans WHERE id = $scanId', { scanId })
      return row ? JSON.parse(row['broken_links'] as string) as BrokenLink[] : []
    },

    hreflangProblems(scanId: string) {
      const row = get('SELECT hreflang_problems FROM scans WHERE id = $scanId', { scanId })
      return row ? JSON.parse(row['hreflang_problems'] as string) as HreflangProblem[] : []
    },

    findBaseline(query) {
      const row = get(`${SCAN_SELECT}
        WHERE sites.origin = $origin AND scans.status = 'done' AND scans.created_at < $before AND scans.id <> $excludeId
          AND NOT EXISTS (SELECT 1 FROM json_each($devices) AS wanted
            WHERE wanted.value NOT IN (SELECT value FROM json_each(scans.devices)))
        ORDER BY (scans.branch = $branch) IS 1 DESC, scans.created_at DESC, scans.id DESC LIMIT 1`, {
        origin: query.origin,
        before: query.before,
        excludeId: query.excludeId,
        devices: JSON.stringify(query.devices),
        branch: query.branch ?? null,
      })
      return row ? toScan(row) : null
    },

    insertPages(scanId: string, pages: NewPage[]) {
      insertPageRows.immediate(scanId, pages)
    },

    setPageStatus(scanId: string, url: string, device: Device, status: PageStatus, error?: string | null) {
      const bindings: Bindings = { scanId, url, device, status, finishedAt: TERMINAL_PAGE_STATUSES.includes(status) ? Date.now() : null }
      let errorSet = ''
      if (error !== undefined) {
        errorSet = ', error = $error'
        bindings['error'] = error
      }
      const previousSet = TERMINAL_PAGE_STATUSES.includes(status) ? ', rescan_previous = NULL' : ''
      const changes = run(`UPDATE pages SET status = $status, finished_at = $finishedAt${errorSet}${previousSet}
        WHERE scan_id = $scanId AND url = $url AND device = $device`, bindings)
      if (changes.changes === 0)
        throw new UnlighthouseError('NOT_FOUND', `Page not found: ${url} (${device}) in scan ${scanId}`)
    },

    queueRescan(scanId: string, url: string, device: Device) {
      const row = get(`UPDATE pages SET rescan_previous = status, status = 'queued', finished_at = NULL
        WHERE scan_id = $scanId AND url = $url AND device = $device AND status NOT IN ('queued', 'running')
        RETURNING rescan_previous`, { scanId, url, device })
      if (!row) {
        const page = get('SELECT status FROM pages WHERE scan_id = $scanId AND url = $url AND device = $device', { scanId, url, device })
        if (!page)
          throw new UnlighthouseError('NOT_FOUND', `Page not found: ${url} (${device}) in scan ${scanId}`)
        throw new UnlighthouseError('SCAN_ACTIVE', `${url} (${device}) is already ${page['status'] as string}`)
      }
      return row['rescan_previous'] as PageStatus
    },

    interruptedRescans() {
      return all(`SELECT pages.scan_id, pages.url, pages.device,
        coalesce(pages.rescan_previous, CASE WHEN pages.provenance IS NOT NULL THEN 'done' END) AS rescan_previous FROM pages JOIN scans ON scans.id = pages.scan_id
        WHERE scans.status IN ('done', 'failed', 'cancelled') AND pages.status IN ('queued', 'running')
        ORDER BY pages.scan_id, pages.url, pages.device`)
        .map(row => ({
          scanId: row['scan_id'] as string,
          url: row['url'] as string,
          device: row['device'] as Device,
          previous: row['rescan_previous'] as PageStatus | null,
        }))
    },

    savePageResult(scanId: string, url: string, device: Device, result: AuditResult) {
      savePage.immediate(scanId, url, device, result)
    },

    getPage(scanId: string, url: string, device: Device) {
      const row = get('SELECT * FROM pages WHERE scan_id = $scanId AND url = $url AND device = $device', { scanId, url, device })
      return row ? toPage(row) : null
    },

    listPages(query: PageQuery): Paged<Page> {
      const where = ['scan_id = $scanId']
      const bindings: Bindings = { scanId: query.scanId }
      for (const key of ['device', 'template', 'status'] as const) {
        if (query[key] !== undefined) {
          where.push(`${key} = $${key}`)
          bindings[key] = query[key]
        }
      }
      if (query.search) {
        where.push(`url LIKE $search ESCAPE '\\'`)
        bindings['search'] = `%${escapeLike(query.search)}%`
      }
      const clause = where.join(' AND ')
      const column = sortColumn(query.sort)
      const direction = query.order === 'desc' ? 'DESC' : 'ASC'
      const order = column === 'url'
        ? `url ${direction}, device`
        : `${column} ${direction} NULLS LAST, url, device`
      const total = get(`SELECT count(*) AS total FROM pages WHERE ${clause}`, bindings)!['total'] as number
      const items = all(`SELECT * FROM pages WHERE ${clause} ORDER BY ${order} LIMIT $limit OFFSET $offset`, { ...bindings, limit: query.limit, offset: query.offset })
      return { items: items.map(toPage), total }
    },

    allPages(scanId: string) {
      return all('SELECT * FROM pages WHERE scan_id = $scanId ORDER BY url, device', { scanId }).map(toPage)
    },

    templates(scanId: string) {
      return all(`SELECT template, count(DISTINCT url) AS pages FROM pages WHERE scan_id = $scanId
        GROUP BY template ORDER BY pages DESC, template`, { scanId })
        .map((row): TemplateCount => ({ template: row['template'] as string, pages: row['pages'] as number }))
    },

    findings(scanId: string, url: string, device: Device) {
      return all(`SELECT * FROM findings WHERE scan_id = $scanId AND url = $url AND device = $device
        ORDER BY severity, coalesce(savings_ms, 0) DESC, coalesce(savings_bytes, 0) DESC, audit_id, item_key`, { scanId, url, device }).map(toFinding)
    },

    listIssues(query) {
      const where = ['f.scan_id = $scanId']
      const bindings: Bindings = { scanId: query.scanId }
      if (query.auditId !== undefined) {
        where.push('f.audit_id = $auditId')
        bindings['auditId'] = query.auditId
      }
      if (query.category !== undefined) {
        where.push('f.category = $category')
        bindings['category'] = query.category
      }
      if (query.device !== undefined) {
        where.push('f.device = $device')
        bindings['device'] = query.device
      }
      if (query.template !== undefined) {
        where.push('p.template = $template')
        bindings['template'] = query.template
      }
      const scoped = `${ISSUE_FROM} WHERE ${where.join(' AND ')}`
      const total = get(`SELECT count(DISTINCT f.audit_id) AS total ${scoped}`, bindings)!['total'] as number
      const rows = all(`WITH per_page AS (
          SELECT f.audit_id, f.url, f.device, p.template,
            max(f.category) AS category, max(f.title) AS title, min(f.severity) AS severity,
            max(f.savings_ms) AS savings_ms, max(f.savings_bytes) AS savings_bytes
          ${scoped}
          GROUP BY f.audit_id, f.url, f.device
        ), grouped AS (
          SELECT audit_id, max(category) AS category, max(title) AS title, min(severity) AS severity,
            count(DISTINCT url) AS pages,
            json_group_array(DISTINCT device) AS devices,
            json_group_array(DISTINCT template) AS templates,
            coalesce(sum(savings_ms), 0) AS savings_ms,
            coalesce(sum(savings_bytes), 0) AS savings_bytes
          FROM per_page GROUP BY audit_id
        )
        SELECT *, pages * (CASE severity WHEN 'fail' THEN 1.0 ELSE 0.5 END) + savings_ms / 1000.0 + savings_bytes / 100000.0 AS impact
        FROM grouped ORDER BY impact DESC, pages DESC, audit_id LIMIT $limit OFFSET $offset`, { ...bindings, limit: query.limit, offset: query.offset })
      const filtered = `${scoped} AND f.audit_id = $issue`
      const examples = db.query<{ url: string }, Bindings>(`SELECT DISTINCT f.url ${filtered} ORDER BY f.url LIMIT 3`)
      const itemCount = db.query<{ items: number }, Bindings>(`SELECT count(DISTINCT f.item_key) AS items ${filtered} AND f.item_key <> ''`)
      const items = rows.map((row): Issue => {
        const issue = { ...bindings, issue: row['audit_id'] as string }
        return {
          auditId: row['audit_id'] as string,
          category: row['category'] as Category | null,
          title: row['title'] as string,
          severity: row['severity'] as Severity,
          pages: row['pages'] as number,
          items: itemCount.get(issue)!.items,
          topItems: issueItemRows(filtered, issue, TOP_ITEMS),
          devices: (JSON.parse(row['devices'] as string) as Device[]).sort(),
          templates: (JSON.parse(row['templates'] as string) as string[]).sort(),
          savingsMs: row['savings_ms'] as number,
          savingsBytes: row['savings_bytes'] as number,
          impact: row['impact'] as number,
          examples: examples.all(issue).map(example => example.url),
        }
      })
      return { items, total }
    },

    issueItems(scanId: string, auditId: string) {
      return issueItemRows(`${ISSUE_FROM} WHERE f.scan_id = $scanId AND f.audit_id = $issue`, { scanId, issue: auditId }, -1)
    },

    issuePages(scanId: string, auditId: string) {
      return all(`SELECT f.url, f.device, p.template, count(DISTINCT nullif(f.item_key, '')) AS items,
          max(f.savings_ms) AS page_ms, max(f.savings_bytes) AS page_bytes, max(f.display_value) AS display_value
        ${ISSUE_FROM}
        WHERE f.scan_id = $scanId AND f.audit_id = $auditId
        GROUP BY f.url, f.device
        ORDER BY coalesce(page_ms, 0) DESC, coalesce(page_bytes, 0) DESC, f.url, f.device`, { scanId, auditId })
        .map((row): IssuePage => ({
          url: row['url'] as string,
          device: row['device'] as Device,
          template: row['template'] as string,
          items: row['items'] as number,
          savingsMs: row['page_ms'] as number | null,
          savingsBytes: row['page_bytes'] as number | null,
          displayValue: row['display_value'] as string | null,
        }))
    },

    getReport(scanId: string, url: string, device: Device) {
      if (!get(`SELECT 1 AS found FROM pages WHERE scan_id = $scanId AND url = $url AND device = $device AND status = 'done'`, { scanId, url, device }))
        return null
      const path = blobPath(scanId, url, device)
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
    },

    getThumbnail(scanId: string, url: string, device: Device) {
      if (!get(`SELECT 1 AS found FROM pages WHERE scan_id = $scanId AND url = $url AND device = $device AND status = 'done'`, { scanId, url, device }))
        return null
      const path = thumbnailPath(scanId, url, device)
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
    },

    pruneScans(origin: string, keep: number) {
      const finished = all(`SELECT scans.id, scans.status FROM scans JOIN sites ON sites.id = scans.site_id
        WHERE sites.origin = $origin AND scans.status IN ('done', 'failed', 'cancelled')
        ORDER BY scans.created_at DESC, scans.id DESC`, { origin })
      const count = Math.max(0, keep)
      const latestDone = count > 0 ? finished.find(row => row['status'] === 'done') : undefined
      const ids = finished.slice(count).filter(row => row !== latestDone).map(row => row['id'] as string)
      removeScans(ids)
      return ids
    },

    cruxCacheGet(key: string, maxAgeMs: number) {
      const row = get('SELECT value FROM crux_cache WHERE key = $key AND fetched_at > $since', { key, since: Date.now() - maxAgeMs })
      return row ? { value: JSON.parse(row['value'] as string) as unknown } : null
    },

    cruxCachePut(key: string, value: unknown) {
      run('DELETE FROM crux_cache WHERE fetched_at < $expired', { expired: Date.now() - CRUX_CACHE_KEEP_MS })
      run(`INSERT INTO crux_cache (key, value, fetched_at) VALUES ($key, $value, $now)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at`, { key, value: JSON.stringify(value ?? null), now: Date.now() })
    },

    saveField(scanId: string, field: FieldResult) {
      saveFieldRows.immediate(scanId, field)
    },

    pageField(scanId: string, url: string, device: Device) {
      const row = get('SELECT source, record FROM page_field WHERE scan_id = $scanId AND url = $url AND device = $device', { scanId, url, device })
      if (!row)
        return null
      const source = row['source'] as FieldSource | null
      const record = source === 'origin' ? originRecord(scanId, device) : parseRecord(row['record'])
      return { source, record }
    },

    scanField(scanId: string) {
      const origins = all('SELECT device, record, fetched_at FROM scan_field WHERE scan_id = $scanId ORDER BY device', { scanId })
      if (!origins.length)
        return null
      const field: ScanField = { fetchedAt: null, origin: {}, coverage: {}, pages: [] }
      for (const row of origins) {
        field.origin[row['device'] as Device] = parseRecord(row['record'])
        field.fetchedAt = Math.max(field.fetchedAt ?? 0, row['fetched_at'] as number)
        field.coverage[row['device'] as Device] = { url: 0, origin: 0, none: 0 }
      }
      for (const row of all('SELECT url, device, source FROM page_field WHERE scan_id = $scanId ORDER BY url, device', { scanId })) {
        const device = row['device'] as Device
        const source = row['source'] as FieldSource | null
        field.pages.push({ url: row['url'] as string, device, source })
        const coverage = field.coverage[device] ??= { url: 0, origin: 0, none: 0 }
        coverage[source ?? 'none']++
      }
      return field
    },
  }
}
