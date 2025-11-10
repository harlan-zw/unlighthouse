-- Users table
CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `email` text NOT NULL,
  `name` text,
  `api_key` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL
);

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
CREATE UNIQUE INDEX `users_api_key_unique` ON `users` (`api_key`);

-- Scans table
CREATE TABLE `scans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `url` text NOT NULL,
  `categories` text NOT NULL,
  `form_factor` text DEFAULT 'mobile' NOT NULL,
  `throttling` text DEFAULT 'mobile4G' NOT NULL,
  `status` text DEFAULT 'queued' NOT NULL,
  `error` text,
  `result` text,
  `fetch_time` text,
  `performance_score` integer,
  `accessibility_score` integer,
  `best_practices_score` integer,
  `seo_score` integer,
  `cached` integer DEFAULT false NOT NULL,
  `endpoint` text DEFAULT 'browserless' NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `scans_user_id_idx` ON `scans` (`user_id`);
CREATE INDEX `scans_url_idx` ON `scans` (`url`);
CREATE INDEX `scans_status_idx` ON `scans` (`status`);
CREATE INDEX `scans_created_at_idx` ON `scans` (`created_at`);
