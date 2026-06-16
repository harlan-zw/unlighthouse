CREATE TABLE `assertions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` text,
	`type` text NOT NULL,
	`category` text,
	`metric` text,
	`value` real NOT NULL,
	`passed` integer NOT NULL,
	`actual` real NOT NULL,
	`failing_routes` text,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comparison_diffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`comparison_id` integer,
	`path` text NOT NULL,
	`url` text NOT NULL,
	`metric_diffs` text NOT NULL,
	`severity` text NOT NULL,
	FOREIGN KEY (`comparison_id`) REFERENCES `comparisons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`base_scan_id` text,
	`current_scan_id` text,
	`improved` integer DEFAULT 0 NOT NULL,
	`regressed` integer DEFAULT 0 NOT NULL,
	`unchanged` integer DEFAULT 0 NOT NULL,
	`new_urls` integer DEFAULT 0 NOT NULL,
	`removed_urls` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`base_scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pack_runs` (
	`scan_id` text NOT NULL,
	`pack_name` text NOT NULL,
	`pack_version` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`report` text,
	`report_blob_key` text,
	PRIMARY KEY(`scan_id`, `pack_name`, `pack_version`),
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pack_runs_scan_id` ON `pack_runs` (`scan_id`);--> statement-breakpoint
CREATE TABLE `scan_crux` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` text NOT NULL,
	`hostname` text NOT NULL,
	`form_factor` text NOT NULL,
	`series_json` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scan_routes` (
	`scan_id` text NOT NULL,
	`url` text NOT NULL,
	`device` text DEFAULT 'mobile' NOT NULL,
	`path` text NOT NULL,
	`route_name` text,
	`score_performance` real,
	`score_accessibility` real,
	`score_seo` real,
	`score_best_practices` real,
	`score_agentic_browsing` real,
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
	`report_blob_key` text,
	`screenshot_blob_key` text,
	PRIMARY KEY(`scan_id`, `url`, `device`),
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`scan_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scan_routes_scan_id` ON `scan_routes` (`scan_id`);--> statement-breakpoint
CREATE TABLE `scans` (
	`scan_id` text PRIMARY KEY NOT NULL,
	`site` text NOT NULL,
	`mode` text DEFAULT 'site' NOT NULL,
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
CREATE INDEX `idx_scans_site` ON `scans` (`site`);--> statement-breakpoint
CREATE INDEX `idx_scans_status` ON `scans` (`status`);--> statement-breakpoint
CREATE INDEX `idx_scans_started_at` ON `scans` (`started_at`);--> statement-breakpoint
CREATE INDEX `idx_scans_find_previous` ON `scans` (`site`,`device`,`ci_branch`,`started_at`);