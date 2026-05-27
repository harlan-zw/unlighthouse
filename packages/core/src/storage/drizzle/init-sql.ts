// v2 init SQL — matches contracts/src/drizzle/sqlite.ts.
// Dashboard aggregation tables removed; all cross-route analysis flows through packs.
export const INIT_SQL_STATEMENTS: readonly string[] = [
  // Sites table
  'CREATE TABLE IF NOT EXISTS `sites` (\n  `id` text PRIMARY KEY NOT NULL,\n  `name` text NOT NULL,\n  `url` text NOT NULL,\n  `group` text,\n  `created_at` text NOT NULL\n);',
  'CREATE INDEX IF NOT EXISTS `idx_sites_url` ON `sites` (`url`);',

  // Core tables
  'CREATE TABLE IF NOT EXISTS `scans` (\n  `scan_id` text PRIMARY KEY NOT NULL,\n  `site` text NOT NULL,\n  `mode` text NOT NULL DEFAULT \'site\',\n  `device` text NOT NULL,\n  `status` text NOT NULL,\n  `started_at` text NOT NULL,\n  `completed_at` text,\n  `ci_branch` text,\n  `ci_commit` text,\n  `ci_commit_message` text,\n  `summary` text,\n  `created_at_ms` integer DEFAULT (unixepoch() * 1000) NOT NULL\n);',
  'CREATE INDEX IF NOT EXISTS `idx_scans_site` ON `scans` (`site`);',
  'CREATE INDEX IF NOT EXISTS `idx_scans_status` ON `scans` (`status`);',
  'CREATE INDEX IF NOT EXISTS `idx_scans_started_at` ON `scans` (`started_at`);',
  'CREATE INDEX IF NOT EXISTS `idx_scans_find_previous` ON `scans` (`site`, `device`, `ci_branch`, `started_at`);',

  'CREATE TABLE IF NOT EXISTS `scan_routes` (\n  `scan_id` text NOT NULL,\n  `url` text NOT NULL,\n  `device` text NOT NULL DEFAULT \'mobile\',\n  `path` text NOT NULL,\n  `route_name` text,\n  `score_performance` real,\n  `score_accessibility` real,\n  `score_seo` real,\n  `score_best_practices` real,\n  `score_agentic_browsing` real,\n  `lcp` real,\n  `cls` real,\n  `inp` real,\n  `fcp` real,\n  `ttfb` real,\n  `tbt` real,\n  `si` real,\n  `lighthouse_version` text NOT NULL,\n  `captured_at` text NOT NULL,\n  `lhr_blob_key` text NOT NULL,\n  `report_blob_key` text,\n  `screenshot_blob_key` text,\n  PRIMARY KEY (`scan_id`, `url`, `device`),\n  FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade\n);',
  'CREATE INDEX IF NOT EXISTS `idx_scan_routes_scan_id` ON `scan_routes` (`scan_id`);',

  'CREATE TABLE IF NOT EXISTS `pack_runs` (\n  `scan_id` text NOT NULL,\n  `pack_name` text NOT NULL,\n  `pack_version` text NOT NULL,\n  `started_at` text NOT NULL,\n  `completed_at` text NOT NULL,\n  `report` text,\n  `report_blob_key` text,\n  PRIMARY KEY (`scan_id`, `pack_name`, `pack_version`),\n  FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade\n);',
  'CREATE INDEX IF NOT EXISTS `idx_pack_runs_scan_id` ON `pack_runs` (`scan_id`);',

  // Comparison + Assertion tables
  'CREATE TABLE IF NOT EXISTS `comparisons` (\n  `id` integer PRIMARY KEY AUTOINCREMENT,\n  `base_scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,\n  `current_scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,\n  `improved` integer NOT NULL DEFAULT 0,\n  `regressed` integer NOT NULL DEFAULT 0,\n  `unchanged` integer NOT NULL DEFAULT 0,\n  `new_urls` integer NOT NULL DEFAULT 0,\n  `removed_urls` integer NOT NULL DEFAULT 0,\n  `created_at` integer DEFAULT (unixepoch())\n);',
  'CREATE TABLE IF NOT EXISTS `comparison_diffs` (\n  `id` integer PRIMARY KEY AUTOINCREMENT,\n  `comparison_id` integer REFERENCES `comparisons`(`id`) ON DELETE cascade,\n  `path` text NOT NULL,\n  `url` text NOT NULL,\n  `metric_diffs` text NOT NULL,\n  `severity` text NOT NULL\n);',
  'CREATE TABLE IF NOT EXISTS `assertions` (\n  `id` integer PRIMARY KEY AUTOINCREMENT,\n  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,\n  `type` text NOT NULL,\n  `category` text,\n  `metric` text,\n  `value` real NOT NULL,\n  `passed` integer NOT NULL,\n  `actual` real NOT NULL,\n  `failing_routes` text\n);',

  // CrUX field data
  'CREATE TABLE IF NOT EXISTS `scan_crux` (\n  `id` integer PRIMARY KEY AUTOINCREMENT,\n  `scan_id` text NOT NULL REFERENCES `scans`(`scan_id`) ON DELETE cascade,\n  `hostname` text NOT NULL,\n  `form_factor` text NOT NULL,\n  `series_json` text NOT NULL,\n  `fetched_at` integer NOT NULL DEFAULT (unixepoch())\n);',
  'CREATE INDEX IF NOT EXISTS `idx_comparisons_scans` ON `comparisons` (`base_scan_id`, `current_scan_id`);',
  'CREATE INDEX IF NOT EXISTS `idx_diffs_comparison` ON `comparison_diffs` (`comparison_id`);',
  'CREATE INDEX IF NOT EXISTS `idx_scan_crux_scan` ON `scan_crux` (`scan_id`, `form_factor`);',

  // Additive migrations for existing databases
  'ALTER TABLE `scans` ADD COLUMN `mode` text DEFAULT \'site\';',
  'ALTER TABLE `scan_routes` ADD COLUMN `score_agentic_browsing` real;',
  'ALTER TABLE `scan_routes` ADD COLUMN `screenshot_blob_key` text;',
  'ALTER TABLE `scan_routes` ADD COLUMN `report_blob_key` text;',
  'ALTER TABLE `scans` ADD COLUMN `site_id` text REFERENCES `sites`(`id`) ON DELETE SET NULL;',
  'CREATE INDEX IF NOT EXISTS `idx_scans_site_id` ON `scans` (`site_id`);',
]

export const INIT_SQL = INIT_SQL_STATEMENTS.join('\n')
