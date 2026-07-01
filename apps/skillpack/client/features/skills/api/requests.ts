import type {
  DiscoverSkillsInput,
  SkillOriginInput,
  ReadSkillDefinitionsInput,
} from "@skillpack/contracts/origins/requests";
import {
  discoverSkillsResponseSchema,
  readSkillDefinitionsResponseSchema,
} from "@skillpack/contracts/origins/responses";
import type {
  DiscoverSkillsResponse,
  ReadSkillDefinitionsResponse,
} from "@skillpack/contracts/origins/responses";
import type {
  CreateSkillInput,
  ForkSkillInput,
  PatchSkillInput,
  SkillVersionLabelInput,
} from "@skillpack/contracts/skills/requests";
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
  ResolvedSkill,
  ForkSkillResponse,
  SkillListItem,
  SkillListResponse,
  SkillPatchedResponse,
  SkillResourceResponse,
  SkillVersionHistoryResponse,
  SkillVersionLabelResponse,
} from "@skillpack/contracts/skills/responses";

import { api } from "@/shared/api/client";

export const fetchSkillList = async (): Promise<SkillListResponse> => {
  const data = await api.get("skills").json();
  return skillListResponseSchema.parse(data);
};

export const fetchSkillDetail = async (
  skillName: string
): Promise<ResolvedSkill> => {
  const data = await api.get(`skills/${skillName}`).json();
  return resolvedSkillSchema.parse(data);
};

export const fetchSkillVersionHistory = async (
  skillName: string
): Promise<SkillVersionHistoryResponse> => {
  const data = await api.get(`skills/${skillName}/versions`).json();
  return skillVersionHistoryResponseSchema.parse(data);
};

export const fetchSkillVersion = async (
  skillName: string,
  versionId: string
): Promise<ResolvedSkill> => {
  const data = await api
    .get(`skills/${skillName}/versions/${versionId}`)
    .json();
  return resolvedSkillSchema.parse(data);
};

export const fetchSkillVersionFile = async (
  skillName: string,
  versionId: string,
  path: string
): Promise<SkillResourceResponse> => {
  const response = await api.get(
    `skills/${skillName}/versions/${versionId}/resources/raw`,
    { searchParams: { path } }
  );
  const content = await response.text();
  const size = Number(
    response.headers.get("content-length") ??
      new TextEncoder().encode(content).length
  );

  return skillResourceResponseSchema.parse({
    content,
    mediaType: response.headers.get("content-type") ?? "text/plain",
    path,
    sha256: response.headers.get("x-skill-resource-sha256") ?? "unknown",
    size,
  });
};

export const fetchSkillFile = async (
  skillName: string,
  path: string
): Promise<SkillResourceResponse> => {
  const data = await api
    .get(`skills/${skillName}/resources`, { searchParams: { path } })
    .json();

  return skillResourceResponseSchema.parse(data);
};

export const createManagedSkill = async (
  input: CreateSkillInput
): Promise<SkillListItem> => {
  const data = await api.post("skills", { json: input }).json();
  return skillListItemSchema.parse(data);
};

export const discoverSkills = async (
  input: DiscoverSkillsInput
): Promise<DiscoverSkillsResponse> => {
  const data = await api.post("origins/discover", { json: input }).json();
  return discoverSkillsResponseSchema.parse(data);
};

export const discoverOriginSkills = (origin: SkillOriginInput) =>
  discoverSkills({ origin });

export const readSkillDefinitions = async (
  input: ReadSkillDefinitionsInput
): Promise<ReadSkillDefinitionsResponse> => {
  const data = await api.post("origins/definitions", { json: input }).json();
  return readSkillDefinitionsResponseSchema.parse(data);
};

export const patchManagedSkill = async (
  skillName: string,
  input: PatchSkillInput
): Promise<SkillPatchedResponse> => {
  const data = await api.patch(`skills/${skillName}`, { json: input }).json();
  return skillPatchedResponseSchema.parse(data);
};

export const forkManagedSkill = async (
  input: ForkSkillInput
): Promise<ForkSkillResponse> => {
  const data = await api.post("skills/fork", { json: input }).json();
  return forkSkillResponseSchema.parse(data);
};

export const upsertSkillVersionLabel = async (
  skillName: string,
  versionId: string,
  input: SkillVersionLabelInput
): Promise<SkillVersionLabelResponse> => {
  const data = await api
    .put(`skills/${skillName}/versions/${versionId}/label`, { json: input })
    .json();
  return skillVersionLabelResponseSchema.parse(data);
};

export const deleteSkillVersionLabel = async (
  skillName: string,
  versionId: string
): Promise<void> => {
  await api.delete(`skills/${skillName}/versions/${versionId}/label`);
};

export const restoreSkillVersion = async (
  skillName: string,
  versionId: string
): Promise<ResolvedSkill> => {
  const data = await api
    .post(`skills/${skillName}/versions/${versionId}/restore`)
    .json();
  return resolvedSkillSchema.parse(data);
};
