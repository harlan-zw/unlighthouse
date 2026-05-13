-- Initial schema. Drizzle-kit regenerates this from
-- src/storage/drizzle/schema/sqlite.ts (`pnpm db:generate`); the
-- hand-rolled version is kept in sync so users without drizzle-kit
-- installed can still bootstrap.
CREATE TABLE IF NOT EXISTS `scans` (
  `scan_id` text PRIMARY KEY NOT NULL,
  `site` text NOT NULL,
  `device` text NOT NULL,
  `status` text NOT NULL,
  `started_at` text NOT NULL,
  `completed_at` text,
  `ci_branch` text,
  `ci_commit` text,
  `ci_commit_message` text,
  `summary` text,
  `created_at_ms` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scans_site` ON `scans` (`site`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scans_status` ON `scans` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scans_started_at` ON `scans` (`started_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scans_find_previous` ON `scans` (`site`, `device`, `ci_branch`, `started_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scan_routes` (
  `scan_id` text NOT NULL,
  `url` text NOT NULL,
  `path` text NOT NULL,
  `route_name` text,
  `score_performance` real,
  `score_accessibility` real,
  `score_seo` real,
  `score_best_practices` real,
  `lcp` real,
  `cls` real,
  `inp` real,
  `fcp` real,
  `ttfb` real,
  `tbt` real,
  `si` real,
  `lighthouse_version` text NOT NULL,
  `captured_at` text NOT NULL,
  `lhr_blob_key` text NOT NULL,
  PRIMARY KEY (`scan_id`, `url`),
  FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_routes_scan_id` ON `scan_routes` (`scan_id`);
