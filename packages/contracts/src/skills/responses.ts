import {
  safeRelativePathSchema,
  skillAllowedToolsSchema,
  skillCompatibilitySchema,
  skillDescriptionSchema,
  skillLicenseSchema,
  skillMetadataSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { z } from "zod";

import { originSelectionSchema } from "../origins/requests";

const skillOriginSummarySchema = z.object({
  kind: z.literal("github"),
  metadata: z.record(z.unknown()).nullable(),
  url: z.string().url(),
});

export const resourceManifestItemSchema = z.object({
  mediaType: z.string().min(1),
  path: safeRelativePathSchema,
  sha256: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const skillListItemSchema = z.object({
  allowedTools: skillAllowedToolsSchema.nullable(),
  compatibility: skillCompatibilitySchema.nullable(),
  createdAt: z.string().datetime(),
  description: skillDescriptionSchema,
  license: skillLicenseSchema.nullable(),
  metadata: skillMetadataSchema.nullable(),
  name: skillNameSchema,
  origin: skillOriginSummarySchema.optional(),
  updatedAt: z.string().datetime(),
});

export const skillListResponseSchema = z.object({
  skills: z.array(skillListItemSchema),
});

export const resolvedSkillSchema = z.object({
  allowedTools: skillAllowedToolsSchema.nullable(),
  compatibility: skillCompatibilitySchema.nullable(),
  content: z.string(),
  createdAt: z.string().datetime(),
  description: skillDescriptionSchema,
  license: skillLicenseSchema.nullable(),
  metadata: skillMetadataSchema.nullable(),
  name: skillNameSchema,
  origin: skillOriginSummarySchema.optional(),
  resources: z.array(resourceManifestItemSchema),
  updatedAt: z.string().datetime(),
});

export const skillResourceResponseSchema = z.object({
  content: z.string(),
  mediaType: z.string().min(1),
  path: safeRelativePathSchema,
  sha256: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const skillPatchedResponseSchema = z.object({
  allowedTools: skillAllowedToolsSchema.nullable(),
  compatibility: skillCompatibilitySchema.nullable(),
  description: skillDescriptionSchema,
  license: skillLicenseSchema.nullable(),
  metadata: skillMetadataSchema.nullable(),
  name: skillNameSchema,
});

export const skillVersionListItemSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  label: z.string().min(1).nullable(),
});

export const skillVersionHistoryResponseSchema = z.object({
  versions: z.array(skillVersionListItemSchema),
});

export const skillVersionLabelResponseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  versionId: z.string().min(1),
});

export const forkSkillResultSchema = z.discriminatedUnion("status", [
  z.object({
    selection: originSelectionSchema,
    skill: skillListItemSchema,
    status: z.literal("forked"),
  }),
  z.object({
    error: z.string().min(1),
    selection: originSelectionSchema,
    status: z.literal("failed"),
  }),
]);

export const forkSkillResponseSchema = z.object({
  results: z.array(forkSkillResultSchema),
});

export type ForkSkillResponse = z.infer<typeof forkSkillResponseSchema>;
export type ResolvedSkill = z.infer<typeof resolvedSkillSchema>;
export type ResourceManifestItem = z.infer<typeof resourceManifestItemSchema>;
export type SkillListItem = z.infer<typeof skillListItemSchema>;
export type SkillListResponse = z.infer<typeof skillListResponseSchema>;
export type SkillPatchedResponse = z.infer<typeof skillPatchedResponseSchema>;
export type SkillResourceResponse = z.infer<typeof skillResourceResponseSchema>;
export type SkillVersionHistoryResponse = z.infer<
  typeof skillVersionHistoryResponseSchema
>;
export type SkillVersionLabelResponse = z.infer<
  typeof skillVersionLabelResponseSchema
>;
export type SkillVersionListItem = z.infer<typeof skillVersionListItemSchema>;
