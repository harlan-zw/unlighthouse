CREATE INDEX `idx_scan_routes_scan_path_device` ON `scan_routes` (`scan_id`,`path`,`device`);--> statement-breakpoint
CREATE INDEX `idx_comparisons_current_created` ON `comparisons` (`current_scan_id`,`created_at`);
