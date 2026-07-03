import { skillContentPath } from "@server/constants";
import { skillVersionsTable } from "@server/db/schema";
import type { SkillFileMetadata } from "@server/shared/skill-file";
import { stripSkillFileFrontmatter } from "@server/shared/skill-file";
import { markdownMediaType } from "@server/shared/text-resource";
import type { SkillOriginJson } from "@skillpack/contracts/skills/state";

import type {
  SkillIdentityRow,
  SkillResourceRow,
  SkillRow,
  SkillVersionFrontmatter,
  SkillVersionRow,
  SkillWithCurrentResources,
  StoredResourceObject,
} from "./types";

export interface SkillOriginInput {
  kind: "github";
  metadata: Record<string, unknown> | null;
  url: string;
}

export interface SkillFileStateInput extends Omit<SkillFileMetadata, "name"> {
  frontmatter: Record<string, unknown>;
}

export type SkillVersionStateRow = Omit<SkillVersionRow, "resourceManifest">;

export const versionStateSelection = {
  createdAt: skillVersionsTable.createdAt,
  description: skillVersionsTable.description,
  frontmatter: skillVersionsTable.frontmatter,
  id: skillVersionsTable.id,
  parentPk: skillVersionsTable.parentPk,
  pk: skillVersionsTable.pk,
  skillFileSha256: skillVersionsTable.skillFileSha256,
  skillFileSize: skillVersionsTable.skillFileSize,
  skillPk: skillVersionsTable.skillPk,
};

export const versionWithManifestSelection = {
  ...versionStateSelection,
  resourceManifest: skillVersionsTable.resourceManifest,
};

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : null;

const optionalStringRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return entries.length === Object.keys(value).length
    ? Object.fromEntries(entries)
    : null;
};

export const toOriginJson = (
  origin?: SkillOriginInput | SkillOriginJson | null
): SkillOriginJson | null =>
  origin
    ? {
        kind: origin.kind,
        metadata: origin.metadata,
        url: origin.url,
      }
    : null;

export const toVersionFrontmatter = (
  metadata: SkillFileStateInput
): SkillVersionFrontmatter | null => {
  const frontmatter = stripSkillFileFrontmatter(
    metadata.frontmatter
  ) as SkillVersionFrontmatter;

  if (metadata.allowedTools) {
    frontmatter["allowed-tools"] = metadata.allowedTools;
  }
  if (metadata.compatibility) {
    frontmatter.compatibility = metadata.compatibility;
  }
  if (metadata.license) {
    frontmatter.license = metadata.license;
  }
  if (metadata.metadata) {
    frontmatter.metadata = metadata.metadata;
  }

  return Object.keys(frontmatter).length > 0 ? frontmatter : null;
};

export const toSkillRow = (
  skill: SkillIdentityRow,
  version: SkillVersionStateRow
): SkillRow => {
  const frontmatter = version.frontmatter ?? {};

  return {
    ...skill,
    allowedTools: optionalString(frontmatter["allowed-tools"]),
    compatibility: optionalString(frontmatter.compatibility),
    description: version.description,
    frontmatter: version.frontmatter,
    headVersionPk: version.pk,
    license: optionalString(frontmatter.license),
    metadata: optionalStringRecord(frontmatter.metadata),
    origin: skill.origin,
    skillFileSha256: version.skillFileSha256,
    skillFileSize: version.skillFileSize,
    versionId: version.id,
  };
};

export const toSkillFileResource = (
  skill: { pk: number },
  version: SkillVersionStateRow
): SkillResourceRow => ({
  mediaType: markdownMediaType,
  path: skillContentPath,
  sha256: version.skillFileSha256,
  size: version.skillFileSize,
  skillPk: skill.pk,
  versionPk: version.pk,
});

export const toStoredResource = (
  resource: StoredResourceObject
): StoredResourceObject => ({
  mediaType: resource.mediaType,
  path: resource.path,
  sha256: resource.sha256,
  size: resource.size,
});

export const toResourceRows = (
  resources: StoredResourceObject[],
  skillPk: number,
  versionPk: number
): SkillResourceRow[] =>
  resources.map((resource) => ({
    ...resource,
    skillPk,
    versionPk,
  }));

export const findManifestResource = (
  version: SkillVersionRow,
  path: string,
  skillPk: number
) => {
  const resource = version.resourceManifest.find((item) => item.path === path);

  return resource ? { ...resource, skillPk, versionPk: version.pk } : undefined;
};

export const findResourceInCurrentVersion = (
  row: { skill: SkillIdentityRow; version: SkillVersionRow },
  path: string
) => {
  if (path === skillContentPath) {
    return toSkillFileResource(row.skill, row.version);
  }

  return findManifestResource(row.version, path, row.skill.pk);
};

export const toSkillWithCurrentResources = (row: {
  skill: SkillIdentityRow;
  version: SkillVersionRow;
}): SkillWithCurrentResources => ({
  resources: toResourceRows(
    row.version.resourceManifest,
    row.skill.pk,
    row.version.pk
  ),
  skill: toSkillRow(row.skill, row.version),
});
