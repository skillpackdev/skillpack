import {
  skillAllowedToolsSchema,
  skillCompatibilitySchema,
  skillDescriptionSchema,
  skillLicenseSchema,
  skillMetadataSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { stringify as stringifyYaml } from "yaml";

import { parseFrontmatter } from "./frontmatter";

export const skillFileFrontmatterKeys = new Set([
  "allowed-tools",
  "compatibility",
  "description",
  "license",
  "metadata",
  "name",
]);

export interface SkillFileMetadata {
  allowedTools?: string | null;
  compatibility?: string | null;
  description: string;
  license?: string | null;
  metadata?: Record<string, string> | null;
  name: string;
}

export interface ParsedSkillFile extends SkillFileMetadata {
  body: string;
  frontmatter: Record<string, unknown>;
}

const parseOptionalString = (
  value: unknown,
  schema: { safeParse: (input: unknown) => { data?: string; success: boolean } }
) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const result = schema.safeParse(value);
  return result.success ? (result.data ?? null) : null;
};

const parseRequiredString = (
  value: unknown,
  schema: { safeParse: (input: unknown) => { data?: string; success: boolean } }
) => {
  const result = schema.safeParse(value);
  return result.success ? (result.data ?? "") : "";
};

const parseMetadata = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  const result = skillMetadataSchema.safeParse(value);
  return result.success ? result.data : null;
};

const optionalEntry = <T>(value: T | null | undefined) =>
  value === null || value === undefined || value === "" ? undefined : value;

export const stripSkillFileFrontmatter = (
  frontmatter?: Record<string, unknown> | null
) =>
  Object.fromEntries(
    Object.entries(frontmatter ?? {}).filter(
      ([key]) => !skillFileFrontmatterKeys.has(key)
    )
  );

export const buildSkillFileFrontmatter = (
  metadata: SkillFileMetadata,
  baseFrontmatter?: Record<string, unknown> | null
) =>
  Object.fromEntries(
    Object.entries({
      ...stripSkillFileFrontmatter(baseFrontmatter),
      "allowed-tools": optionalEntry(metadata.allowedTools),
      compatibility: optionalEntry(metadata.compatibility),
      description: metadata.description,
      license: optionalEntry(metadata.license),
      metadata: optionalEntry(metadata.metadata),
      name: metadata.name,
    }).filter(([, value]) => value !== undefined)
  );

export const parseSkillFile = (raw: string): ParsedSkillFile => {
  const { content, data } = parseFrontmatter(raw);
  const name = parseRequiredString(data.name, skillNameSchema);
  const description = parseRequiredString(
    data.description,
    skillDescriptionSchema
  );

  if (!(name && description)) {
    throw new Error("Skill frontmatter must include name and description");
  }

  return {
    allowedTools: parseOptionalString(
      data["allowed-tools"],
      skillAllowedToolsSchema
    ),
    body: content,
    compatibility: parseOptionalString(
      data.compatibility,
      skillCompatibilitySchema
    ),
    description,
    frontmatter: data,
    license: parseOptionalString(data.license, skillLicenseSchema),
    metadata: parseMetadata(data.metadata),
    name,
  };
};

export const serializeSkillFile = (
  metadata: SkillFileMetadata,
  body: string,
  baseFrontmatter?: Record<string, unknown>
) => {
  const frontmatter = buildSkillFileFrontmatter(metadata, baseFrontmatter);

  return `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${body}`;
};
