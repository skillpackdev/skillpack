import {
  optionalSkillAllowedToolsSchema,
  optionalSkillCompatibilitySchema,
  optionalSkillLicenseSchema,
  safeRelativePathSchema,
  skillDescriptionSchema,
  skillMetadataSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { z } from "zod";

import { originSelectionSchema, skillOriginSchema } from "../origins/requests";

const createSkillResourceSchema = z.object({
  content: z.string(),
  mediaType: z.string().min(1).optional(),
  path: safeRelativePathSchema,
});

export const createSkillSchema = z.object({
  allowedTools: optionalSkillAllowedToolsSchema.nullable(),
  compatibility: optionalSkillCompatibilitySchema.nullable(),
  content: z.string().min(1),
  description: skillDescriptionSchema,
  license: optionalSkillLicenseSchema.nullable(),
  metadata: skillMetadataSchema.nullable().optional(),
  name: skillNameSchema,
  resources: z.array(createSkillResourceSchema).default([]),
});

export const patchSkillSchema = z
  .object({
    allowedTools: optionalSkillAllowedToolsSchema.nullable(),
    compatibility: optionalSkillCompatibilitySchema.nullable(),
    content: z.string().min(1).optional(),
    deleteResourcePaths: z.array(safeRelativePathSchema).default([]),
    description: skillDescriptionSchema.optional(),
    license: optionalSkillLicenseSchema.nullable(),
    metadata: skillMetadataSchema.nullable().optional(),
    name: skillNameSchema.optional(),
    upsertResources: z.array(createSkillResourceSchema).default([]),
  })
  .strict()
  .refine(
    (input) =>
      input.allowedTools !== undefined ||
      input.compatibility !== undefined ||
      input.content !== undefined ||
      input.deleteResourcePaths.length > 0 ||
      input.description !== undefined ||
      input.license !== undefined ||
      input.metadata !== undefined ||
      input.name !== undefined ||
      input.upsertResources.length > 0,
    "PATCH must change Skill state or resources"
  );

export const skillVersionLabelSchema = z.object({
  label: z.string().trim().min(1).max(160),
});

export const forkSkillSchema = z
  .object({
    origin: skillOriginSchema,
    selections: z.array(originSelectionSchema).min(1),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();

    for (const [index, selection] of input.selections.entries()) {
      if (seen.has(selection.skillName)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selected skills must use unique names",
          path: ["selections", index, "skillName"],
        });
      }

      seen.add(selection.skillName);
    }
  });

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type ForkSkillInput = z.infer<typeof forkSkillSchema>;
export type PatchSkillInput = z.infer<typeof patchSkillSchema>;
export type SkillVersionLabelInput = z.infer<typeof skillVersionLabelSchema>;
