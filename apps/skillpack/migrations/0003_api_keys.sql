CREATE TABLE `api_keys` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_user_id` text NOT NULL,
  `name` text NOT NULL,
  `key_hash` text NOT NULL,
  `key_hint` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `last_used_at` integer,
  `revoked_at` integer
);

CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);
CREATE INDEX `api_keys_owner_user_id_idx` ON `api_keys` (`owner_user_id`);
