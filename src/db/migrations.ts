import type { Database } from 'bun:sqlite'
import { CATEGORIES, FLOW_METRICS, METRICS } from '../types.ts'
import type { Category, FlowMetric } from '../types.ts'

export function scoreColumn(category: Category): string {
  return `score_${category.replaceAll('-', '_')}`
}

export function metricColumn(metric: FlowMetric): string {
  return `metric_${metric}`
}

const SORT_COLUMNS = [...CATEGORIES.map(scoreColumn), ...METRICS.map(metricColumn)]

export const MIGRATIONS: string[] = [
  `
  CREATE TABLE sites (
    id INTEGER PRIMARY KEY,
    origin TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE scans (
    id TEXT PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    label TEXT,
    branch TEXT,
    "commit" TEXT,
    devices TEXT NOT NULL,
    options TEXT NOT NULL,
    stats TEXT NOT NULL,
    broken_links TEXT NOT NULL DEFAULT '[]',
    lighthouse_version TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
  );
  CREATE INDEX scans_site_created ON scans(site_id, created_at DESC, id DESC);
  CREATE INDEX scans_created ON scans(created_at DESC, id DESC);

  CREATE TABLE pages (
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    path TEXT NOT NULL,
    template TEXT NOT NULL,
    status TEXT NOT NULL,
    ${SORT_COLUMNS.map(column => `${column} REAL,`).join('\n    ')}
    final_url TEXT,
    status_code INTEGER,
    provenance TEXT,
    error TEXT,
    duration_ms REAL,
    finished_at INTEGER,
    PRIMARY KEY (scan_id, url, device)
  );
  CREATE INDEX pages_device ON pages(scan_id, device, status);
  CREATE INDEX pages_template ON pages(scan_id, template, device);

  CREATE TABLE findings (
    id INTEGER PRIMARY KEY,
    scan_id TEXT NOT NULL,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    audit_id TEXT NOT NULL,
    category TEXT,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    score REAL,
    display_value TEXT,
    item_key TEXT NOT NULL DEFAULT '',
    item_label TEXT,
    savings_ms REAL,
    savings_bytes REAL,
    FOREIGN KEY (scan_id, url, device) REFERENCES pages(scan_id, url, device) ON DELETE CASCADE
  );
  CREATE INDEX findings_page ON findings(scan_id, url, device);
  CREATE INDEX findings_issue ON findings(scan_id, audit_id, item_key, url, device);
  `,
  `
  ALTER TABLE scans ADD COLUMN hreflang_problems TEXT NOT NULL DEFAULT '[]';
  `,
  `
  CREATE TABLE crux_cache (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE scan_field (
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    device TEXT NOT NULL,
    record TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (scan_id, device)
  );

  CREATE TABLE page_field (
    scan_id TEXT NOT NULL,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    source TEXT,
    record TEXT,
    PRIMARY KEY (scan_id, url, device),
    FOREIGN KEY (scan_id, url, device) REFERENCES pages(scan_id, url, device) ON DELETE CASCADE
  );
  `,
  `
  ALTER TABLE pages ADD COLUMN rescan_previous TEXT;
  `,
  `
  CREATE TABLE flow_runs (
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    device TEXT NOT NULL,
    status TEXT NOT NULL,
    start_url TEXT NOT NULL,
    lighthouse_version TEXT,
    error TEXT,
    duration_ms REAL,
    finished_at INTEGER NOT NULL,
    PRIMARY KEY (scan_id, name, device)
  );

  CREATE TABLE flow_steps (
    scan_id TEXT NOT NULL,
    flow TEXT NOT NULL,
    device TEXT NOT NULL,
    step INTEGER NOT NULL,
    name TEXT NOT NULL,
    mode TEXT NOT NULL,
    url TEXT NOT NULL,
    ${[...CATEGORIES.map(scoreColumn), ...FLOW_METRICS.map(metricColumn)].map(column => `${column} REAL,`).join('\n    ')}
    warnings TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (scan_id, flow, device, step),
    FOREIGN KEY (scan_id, flow, device) REFERENCES flow_runs(scan_id, name, device) ON DELETE CASCADE
  );

  CREATE TABLE flow_findings (
    id INTEGER PRIMARY KEY,
    scan_id TEXT NOT NULL,
    flow TEXT NOT NULL,
    device TEXT NOT NULL,
    step INTEGER NOT NULL,
    audit_id TEXT NOT NULL,
    category TEXT,
    title TEXT NOT NULL,
    severity TEXT NOT NULL,
    score REAL,
    display_value TEXT,
    item_key TEXT NOT NULL DEFAULT '',
    item_label TEXT,
    savings_ms REAL,
    savings_bytes REAL,
    FOREIGN KEY (scan_id, flow, device, step) REFERENCES flow_steps(scan_id, flow, device, step) ON DELETE CASCADE
  );
  CREATE INDEX flow_findings_step ON flow_findings(scan_id, flow, device, step);
  `,
  `
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    site TEXT NOT NULL,
    cron TEXT NOT NULL,
    devices TEXT,
    overrides TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'api',
    last_run_at INTEGER,
    next_run_at INTEGER,
    last_scan_id TEXT,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT NOT NULL,
    sites TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE notification_deliveries (
    id INTEGER PRIMARY KEY,
    notification_id TEXT NOT NULL,
    scan_id TEXT,
    events TEXT NOT NULL,
    status TEXT NOT NULL,
    attempts INTEGER NOT NULL,
    http_status INTEGER,
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX notification_deliveries_created ON notification_deliveries(created_at DESC, id DESC);
  `,
]

export function migrate(db: Database): number {
  const current = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version
  if (current > MIGRATIONS.length)
    throw new Error(`Database schema version ${current} is newer than this Unlighthouse (${MIGRATIONS.length})`)
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.transaction(() => {
      db.run(MIGRATIONS[version]!)
      db.run(`PRAGMA user_version = ${version + 1}`)
    }).immediate()
  }
  return MIGRATIONS.length
}
