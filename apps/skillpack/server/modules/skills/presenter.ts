import {
  forkSkillResponseSchema,
  resolvedSkillSchema,
  skillListItemSchema,
  skillListResponseSchema,
  skillPatchedResponseSchema,
  skillResourceResponseSchema,
  skillVersionHistoryResponseSchema,
  skillVersionLabelResponseSchema,
} from "@skillpack/contracts/skills/responses";

import type {
  ForkSkillServiceResult,
  PatchSkillResult,
  ReadSkillTextFileResult,
  ResolvedSkillResult,
  SkillOrigin,
  SkillVersionHistoryResult,
  SkillVersionLabelResult,
  SkillWithCurrentState,
} from "./types";

const presentOrigin = (origin?: SkillOrigin | null) => {
  if (!origin || origin.kind !== "github") {
    return;
  }

  return {
    kind: "github" as const,
    metadata: origin.metadata,
    url: origin.url,
  };
};

export const presentSkillList = (skills: SkillWithCurrentState[]) =>
  skillListResponseSchema.parse({
    skills: skills.map(({ skill }) => ({
      allowedTools: skill.allowedTools,
      compatibility: skill.compatibility,
      createdAt: skill.createdAt.toISOString(),
      description: skill.description,
      license: skill.license,
      metadata: skill.metadata,
      name: skill.name,
      origin: presentOrigin(skill.origin),
      updatedAt: skill.updatedAt.toISOString(),
    })),
  });

export const presentSkill = (result: ResolvedSkillResult) =>
  resolvedSkillSchema.parse({
    allowedTools: result.skill.allowedTools,
    compatibility: result.skill.compatibility,
    content: result.content,
    createdAt: result.skill.createdAt.toISOString(),
    description: result.skill.description,
    license: result.skill.license,
    metadata: result.skill.metadata,
    name: result.skill.name,
    origin: presentOrigin(result.skill.origin),
    resources: result.resources.map((resource) => ({
      mediaType: resource.mediaType,
      path: resource.path,
      sha256: resource.sha256,
      size: resource.size,
    })),
    updatedAt: result.skill.updatedAt.toISOString(),
  });

export const presentSkillSummary = (result: ResolvedSkillResult) =>
  skillListItemSchema.parse({
    allowedTools: result.skill.allowedTools,
    compatibility: result.skill.compatibility,
    createdAt: result.skill.createdAt.toISOString(),
    description: result.skill.description,
    license: result.skill.license,
    metadata: result.skill.metadata,
    name: result.skill.name,
    origin: presentOrigin(result.skill.origin),
    updatedAt: result.skill.updatedAt.toISOString(),
  });

export const presentForkedSkills = (result: ForkSkillServiceResult) =>
  forkSkillResponseSchema.parse({
    results: result.results.map((item) => {
      if (item.status === "failed") {
        return item;
      }

      return {
        selection: item.selection,
        skill: presentSkillSummary(item.skill),
        status: item.status,
      };
    }),
  });

export const presentSkillFile = (result: ReadSkillTextFileResult) =>
  skillResourceResponseSchema.parse({
    content: result.content,
    mediaType: result.resource.mediaType,
    path: result.resource.path,
    sha256: result.resource.sha256,
    size: result.resource.size,
  });

export const presentPatchedSkill = (result: PatchSkillResult) =>
  skillPatchedResponseSchema.parse(result);

export const presentSkillVersionHistory = (result: SkillVersionHistoryResult) =>
  skillVersionHistoryResponseSchema.parse({
    versions: result.versions.map((version) => ({
      createdAt: version.createdAt.toISOString(),
      id: version.id,
      label: version.label,
    })),
  });

export const presentSkillVersionLabel = (result: SkillVersionLabelResult) =>
  skillVersionLabelResponseSchema.parse(result);
