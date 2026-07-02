CREATE TABLE `skills_new` (
  `created_at` integer NOT NULL,
  `head_version_pk` integer NOT NULL,
  `name` text NOT NULL,
  `origin` text,
  `owner_user_id` text NOT NULL,
  `pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `skills_new` (
  `created_at`,
  `head_version_pk`,
  `name`,
  `origin`,
  `owner_user_id`,
  `pk`,
  `updated_at`
)
SELECT
  `skills`.`created_at`,
  `skills`.`head_version_pk`,
  `skills`.`name`,
  (
    SELECT `skill_versions`.`origin`
    FROM `skill_versions`
    WHERE `skill_versions`.`pk` = `skills`.`head_version_pk`
    LIMIT 1
  ),
  `skills`.`owner_user_id`,
  `skills`.`pk`,
  `skills`.`updated_at`
FROM `skills`;

CREATE TABLE `skill_versions_new` (
  `created_at` integer NOT NULL,
  `description` text NOT NULL,
  `frontmatter` text,
  `id` text NOT NULL,
  `parent_pk` integer,
  `pk` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `resource_manifest` text NOT NULL,
  `skill_file_sha256` text NOT NULL,
  `skill_file_size` integer NOT NULL,
  `skill_pk` integer NOT NULL
);

INSERT INTO `skill_versions_new` (
  `created_at`,
  `description`,
  `frontmatter`,
  `id`,
  `parent_pk`,
  `pk`,
  `resource_manifest`,
  `skill_file_sha256`,
  `skill_file_size`,
  `skill_pk`
)
SELECT
  `skill_versions`.`created_at`,
  `skill_versions`.`description`,
  json_object(
    'allowed-tools', `skill_versions`.`allowed_tools`,
    'compatibility', `skill_versions`.`compatibility`,
    'license', `skill_versions`.`license`,
    'metadata', json(`skill_versions`.`metadata`)
  ),
  `skill_versions`.`id`,
  `skill_versions`.`parent_pk`,
  `skill_versions`.`pk`,
  coalesce(
    (
      SELECT json_group_array(
        json_object(
          'mediaType', `skill_version_resources`.`media_type`,
          'path', `skill_version_resources`.`path`,
          'sha256', `skill_version_resources`.`sha256`,
          'size', `skill_version_resources`.`size`
        )
      )
      FROM `skill_version_resources`
      WHERE `skill_version_resources`.`version_pk` = `skill_versions`.`pk`
        AND `skill_version_resources`.`path` != 'SKILL.md'
    ),
    '[]'
  ),
  (
    SELECT `skill_version_resources`.`sha256`
    FROM `skill_version_resources`
    WHERE `skill_version_resources`.`version_pk` = `skill_versions`.`pk`
      AND `skill_version_resources`.`path` = 'SKILL.md'
    LIMIT 1
  ),
  (
    SELECT `skill_version_resources`.`size`
    FROM `skill_version_resources`
    WHERE `skill_version_resources`.`version_pk` = `skill_versions`.`pk`
      AND `skill_version_resources`.`path` = 'SKILL.md'
    LIMIT 1
  ),
  `skill_versions`.`skill_pk`
FROM `skill_versions`;

DROP TABLE `skills`;
DROP TABLE `skill_versions`;
DROP TABLE `skill_version_resources`;

ALTER TABLE `skills_new` RENAME TO `skills`;
ALTER TABLE `skill_versions_new` RENAME TO `skill_versions`;

CREATE UNIQUE INDEX `skills_owner_name_unique` ON `skills` (`owner_user_id`, `name`);
CREATE UNIQUE INDEX `skill_versions_id_unique` ON `skill_versions` (`id`);
CREATE INDEX `skill_versions_parent_idx` ON `skill_versions` (`parent_pk`);
CREATE INDEX `skill_versions_skill_idx` ON `skill_versions` (`skill_pk`);
