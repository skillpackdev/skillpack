CREATE TABLE `skill_versions` (
  `pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `id` text NOT NULL,
  `skill_pk` integer NOT NULL,
  `parent_pk` integer,
  `description` text NOT NULL,
  `license` text,
  `compatibility` text,
  `allowed_tools` text,
  `metadata` text,
  `origin` text,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `skill_versions_id_unique` ON `skill_versions` (`id`);
CREATE INDEX `skill_versions_parent_idx` ON `skill_versions` (`parent_pk`);
CREATE INDEX `skill_versions_skill_idx` ON `skill_versions` (`skill_pk`);

CREATE TABLE `skill_version_resources` (
  `version_pk` integer NOT NULL,
  `path` text NOT NULL,
  `sha256` text NOT NULL,
  `media_type` text NOT NULL,
  `size` integer NOT NULL,
  `created_at` integer NOT NULL
);

CREATE INDEX `skill_version_resources_sha_idx` ON `skill_version_resources` (`sha256`);
CREATE INDEX `skill_version_resources_version_idx` ON `skill_version_resources` (`version_pk`);
CREATE UNIQUE INDEX `skill_version_resources_version_path_unique` ON `skill_version_resources` (`version_pk`, `path`);

CREATE TABLE `skill_version_labels` (
  `pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `id` text NOT NULL,
  `skill_pk` integer NOT NULL,
  `version_pk` integer NOT NULL,
  `label` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `skill_version_labels_id_unique` ON `skill_version_labels` (`id`);
CREATE UNIQUE INDEX `skill_version_labels_skill_version_unique` ON `skill_version_labels` (`skill_pk`, `version_pk`);
CREATE INDEX `skill_version_labels_version_idx` ON `skill_version_labels` (`version_pk`);

INSERT INTO `skill_versions` (
  `id`,
  `skill_pk`,
  `parent_pk`,
  `description`,
  `license`,
  `compatibility`,
  `allowed_tools`,
  `metadata`,
  `origin`,
  `created_at`
)
SELECT
  lower(hex(randomblob(12))),
  `id`,
  NULL,
  `description`,
  `license`,
  `compatibility`,
  `allowed_tools`,
  `metadata`,
  `origin`,
  `updated_at`
FROM `skills`;

INSERT INTO `skill_version_resources` (
  `version_pk`,
  `path`,
  `sha256`,
  `media_type`,
  `size`,
  `created_at`
)
SELECT
  `skill_versions`.`pk`,
  `skill_resources`.`path`,
  `skill_resources`.`sha256`,
  `skill_resources`.`media_type`,
  `skill_resources`.`size`,
  `skill_resources`.`created_at`
FROM `skill_resources`
INNER JOIN `skill_versions` ON `skill_versions`.`skill_pk` = `skill_resources`.`skill_id`;

CREATE TABLE `skills_new` (
  `pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `owner_user_id` text NOT NULL,
  `name` text NOT NULL,
  `head_version_pk` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `skills_new` (
  `pk`,
  `owner_user_id`,
  `name`,
  `head_version_pk`,
  `created_at`,
  `updated_at`
)
SELECT
  `skills`.`id`,
  `skills`.`owner_user_id`,
  `skills`.`name`,
  (
    SELECT `skill_versions`.`pk`
    FROM `skill_versions`
    WHERE `skill_versions`.`skill_pk` = `skills`.`id`
    ORDER BY `skill_versions`.`pk` DESC
    LIMIT 1
  ),
  `skills`.`created_at`,
  `skills`.`updated_at`
FROM `skills`;

DROP TABLE `skill_resources`;
DROP TABLE `skill_snapshots`;
DROP TABLE `skills`;
ALTER TABLE `skills_new` RENAME TO `skills`;

CREATE UNIQUE INDEX `skills_owner_name_unique` ON `skills` (`owner_user_id`, `name`);
