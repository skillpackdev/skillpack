CREATE TABLE `api_keys` (
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`key_hash` text NOT NULL,
	`key_hint` text NOT NULL,
	`last_used_at` integer,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `api_keys_owner_user_id_idx` ON `api_keys` (`owner_user_id`);