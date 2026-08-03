CREATE TABLE `last_sync` (
	`key` text PRIMARY KEY NOT NULL,
	`synced_at` integer NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL
);
