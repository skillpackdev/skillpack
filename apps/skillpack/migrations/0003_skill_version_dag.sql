CREATE TABLE `skill_versions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `skill_id` integer NOT NULL,
  `parent_id` integer,
  `description` text NOT NULL,
  `license` text,
  `compatibility` text,
  `allowed_tools` text,
  `metadata` text,
  `origin` text,
  `author_kind` text NOT NULL,
  `token_id` text,
  `created_at` integer NOT NULL
);

CREATE INDEX `skill_versions_parent_idx` ON `skill_versions` (`parent_id`);
CREATE INDEX `skill_versions_skill_idx` ON `skill_versions` (`skill_id`);

CREATE TABLE `skill_version_resources` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `version_id` integer NOT NULL,
  `path` text NOT NULL,
  `sha256` text NOT NULL,
  `media_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `skill_version_resources_sha_idx` ON `skill_version_resources` (`sha256`);
CREATE INDEX `skill_version_resources_version_idx` ON `skill_version_resources` (`version_id`);
CREATE UNIQUE INDEX `skill_version_resources_version_path_unique` ON `skill_version_resources` (`version_id`, `path`);

CREATE TABLE `skill_refs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `skill_id` integer NOT NULL,
  `version_id` integer NOT NULL,
  `name` text NOT NULL,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `skill_refs_skill_name_unique` ON `skill_refs` (`skill_id`, `name`);
CREATE INDEX `skill_refs_version_idx` ON `skill_refs` (`version_id`);

INSERT INTO `skill_versions` (
  `skill_id`,
  `parent_id`,
  `description`,
  `license`,
  `compatibility`,
  `allowed_tools`,
  `metadata`,
  `origin`,
  `author_kind`,
  `token_id`,
  `created_at`
)
SELECT
  `id`,
  NULL,
  `description`,
  `license`,
  `compatibility`,
  `allowed_tools`,
  `metadata`,
  `origin`,
  'user',
  NULL,
  `created_at`
FROM `skills`;

INSERT INTO `skill_version_resources` (
  `version_id`,
  `path`,
  `sha256`,
  `media_type`,
  `size`,
  `created_at`
)
SELECT
  `skill_versions`.`id`,
  `skill_resources`.`path`,
  `skill_resources`.`sha256`,
  `skill_resources`.`media_type`,
  `skill_resources`.`size`,
  `skill_resources`.`created_at`
FROM `skill_resources`
INNER JOIN `skill_versions` ON `skill_versions`.`skill_id` = `skill_resources`.`skill_id`;

CREATE TABLE `skills_next` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_user_id` text NOT NULL,
  `name` text NOT NULL,
  `head_version_id` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `skills_next` (
  `id`,
  `owner_user_id`,
  `name`,
  `head_version_id`,
  `created_at`,
  `updated_at`
)
SELECT
  `skills`.`id`,
  `skills`.`owner_user_id`,
  `skills`.`name`,
  (
    SELECT `skill_versions`.`id`
    FROM `skill_versions`
    WHERE `skill_versions`.`skill_id` = `skills`.`id`
    ORDER BY `skill_versions`.`id` DESC
    LIMIT 1
  ),
  `skills`.`created_at`,
  `skills`.`updated_at`
FROM `skills`;

DROP TABLE `skills`;
ALTER TABLE `skills_next` RENAME TO `skills`;
CREATE UNIQUE INDEX `skills_owner_name_unique` ON `skills` (`owner_user_id`, `name`);

DROP TABLE `skill_resources`;
DROP TABLE `skill_snapshots`;
