CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`group` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sites_url` ON `sites` (`url`);--> statement-breakpoint
ALTER TABLE `scans` ADD `site_id` text REFERENCES `sites`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `idx_scans_site_id` ON `scans` (`site_id`);
