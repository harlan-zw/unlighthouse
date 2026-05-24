CREATE INDEX `idx_diffs_comparison` ON `comparison_diffs` (`comparison_id`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_scans` ON `comparisons` (`base_scan_id`,`current_scan_id`);--> statement-breakpoint
CREATE INDEX `idx_scan_crux_scan` ON `scan_crux` (`scan_id`,`form_factor`);