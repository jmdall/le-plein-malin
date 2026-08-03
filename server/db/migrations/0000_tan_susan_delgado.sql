CREATE TABLE `favorites` (
	`station_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `price_history` (
	`station_id` text NOT NULL,
	`fuel` text NOT NULL,
	`day` text NOT NULL,
	`price` real NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`station_id`, `fuel`, `day`),
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_price_history_fuel_day` ON `price_history` (`fuel`,`day`);--> statement-breakpoint
CREATE TABLE `prices` (
	`station_id` text NOT NULL,
	`fuel` text NOT NULL,
	`price` real NOT NULL,
	`updated_at` integer NOT NULL,
	`rupture` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY(`station_id`, `fuel`),
	FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_prices_station_fuel` ON `prices` (`station_id`,`fuel`);--> statement-breakpoint
CREATE TABLE `stations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`postal_code` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`department_code` text,
	`region_code` text,
	`closed` integer DEFAULT false NOT NULL,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicle_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fuel` text NOT NULL,
	`consumption` real NOT NULL,
	`tank_capacity` real NOT NULL,
	`current_level` real NOT NULL,
	`preferred_quantity` real,
	`savings_threshold` real DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
