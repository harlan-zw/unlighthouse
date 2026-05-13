-- Initial schema. Drizzle-kit regenerates this from
-- packages/contracts/src/drizzle/sqlite.ts (`pnpm db:generate`); the
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
--> statement-breakpoint
-- ============================================================================
-- Dashboard-private aggregation tables (populated by core/report/processScanData)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `performance_issues` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `type` text NOT NULL,
  `url` text NOT NULL,
  `wasted_bytes` integer,
  `wasted_ms` integer,
  `page_count` integer NOT NULL DEFAULT 1,
  `pages` text,
  `issue_subtype` text,
  `details` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `third_party_scripts` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `entity` text NOT NULL,
  `url` text NOT NULL,
  `avg_tbt` integer,
  `total_tbt` integer,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `lcp_elements` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `selector` text NOT NULL,
  `element_type` text,
  `avg_lcp` integer,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `accessibility_issues` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `audit_id` text NOT NULL,
  `title` text NOT NULL,
  `severity` text NOT NULL,
  `wcag_criteria` text,
  `wcag_level` text,
  `instance_count` integer NOT NULL,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `accessibility_elements` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `selector` text NOT NULL,
  `snippet` text,
  `audit_id` text NOT NULL,
  `severity` text NOT NULL,
  `issue_description` text,
  `foreground_color` text,
  `background_color` text,
  `contrast_ratio` real,
  `required_ratio` real,
  `bounding_rect` text,
  `screenshot_page` text,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `missing_alt_images` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `url` text NOT NULL,
  `thumbnail` text,
  `is_decorative` integer DEFAULT 0,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `security_issues` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `type` text NOT NULL,
  `severity` text NOT NULL,
  `description` text,
  `details` text,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `detected_libraries` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `name` text NOT NULL,
  `version` text,
  `source_file` text,
  `status` text NOT NULL,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vulnerable_libraries` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `name` text NOT NULL,
  `version` text NOT NULL,
  `severity` text NOT NULL,
  `cves` text,
  `description` text,
  `recommendation` text,
  `source_file` text,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `deprecated_apis` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `api` text NOT NULL,
  `description` text,
  `alternative` text,
  `removal_date` text,
  `is_third_party` integer DEFAULT 0,
  `source_file` text,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `console_errors` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `message` text NOT NULL,
  `normalized_message` text,
  `source_type` text NOT NULL,
  `source_file` text,
  `stack_trace` text,
  `instance_count` integer NOT NULL,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `seo_meta` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `path` text NOT NULL,
  `title` text,
  `title_length` integer,
  `meta_description` text,
  `meta_description_length` integer,
  `is_indexable` integer DEFAULT 1,
  `robots_directive` text,
  `blocked_by_robots_txt` integer DEFAULT 0,
  `canonical` text,
  `canonical_type` text,
  `og_title` text,
  `og_description` text,
  `og_image` text,
  `og_url` text,
  `twitter_card` text,
  `twitter_title` text,
  `twitter_description` text,
  `twitter_image` text,
  `has_structured_data` integer DEFAULT 0,
  `structured_data_types` text,
  `structured_data_valid` integer,
  `structured_data_warnings` text,
  `hreflang_tags` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `seo_duplicates` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `type` text NOT NULL,
  `value` text NOT NULL,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `canonical_chains` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `chain_type` text NOT NULL,
  `pages` text NOT NULL,
  `final_target` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `link_text_issues` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `text` text NOT NULL,
  `instance_count` integer NOT NULL,
  `page_count` integer NOT NULL,
  `pages` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tap_target_issues` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `path` text NOT NULL,
  `element_count` integer NOT NULL,
  `elements` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comparisons` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `base_scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `current_scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `improved` integer NOT NULL DEFAULT 0,
  `regressed` integer NOT NULL DEFAULT 0,
  `unchanged` integer NOT NULL DEFAULT 0,
  `new_urls` integer NOT NULL DEFAULT 0,
  `removed_urls` integer NOT NULL DEFAULT 0,
  `created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `comparison_diffs` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `comparison_id` integer REFERENCES `comparisons`(`id`) ON DELETE cascade,
  `path` text NOT NULL,
  `url` text NOT NULL,
  `metric_diffs` text NOT NULL,
  `severity` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assertions` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `type` text NOT NULL,
  `category` text,
  `metric` text,
  `value` real NOT NULL,
  `passed` integer NOT NULL,
  `actual` real NOT NULL,
  `failing_routes` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `scan_crux` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text NOT NULL REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `hostname` text NOT NULL,
  `form_factor` text NOT NULL,
  `series_json` text NOT NULL,
  `fetched_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `dashboard_summaries` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `scan_id` text UNIQUE REFERENCES `scans`(`scan_id`) ON DELETE cascade,
  `performance_summary` text,
  `accessibility_summary` text,
  `best_practices_summary` text,
  `seo_summary` text,
  `computed_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_perf_issues_scan_type` ON `performance_issues` (`scan_id`, `type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_third_party_scan` ON `third_party_scripts` (`scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_a11y_issues_scan_severity` ON `accessibility_issues` (`scan_id`, `severity`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_a11y_elements_scan` ON `accessibility_elements` (`scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_seo_meta_scan` ON `seo_meta` (`scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_seo_duplicates_scan` ON `seo_duplicates` (`scan_id`, `type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_comparisons_scans` ON `comparisons` (`base_scan_id`, `current_scan_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_diffs_comparison` ON `comparison_diffs` (`comparison_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_scan_crux_scan` ON `scan_crux` (`scan_id`, `form_factor`);
