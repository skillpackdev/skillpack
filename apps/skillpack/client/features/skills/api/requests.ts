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
} from "@skillpack/contracts/skills/requests";
import {
  forkSkillResponseSchema,
  resolvedSkillSchema,
  skillListItemSchema,
  skillListResponseSchema,
  skillPatchedResponseSchema,
  skillResourceResponseSchema,
} from "@skillpack/contracts/skills/responses";
import type {
  ResolvedSkill,
  ForkSkillResponse,
  SkillListItem,
  SkillListResponse,
  SkillPatchedResponse,
  SkillResourceResponse,
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
