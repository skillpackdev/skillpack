import { useQuery } from "@tanstack/react-query";

import {
  activeSkillQueryOptions,
  skillFileQueryOptions,
  skillVersionFileQueryOptions,
  skillVersionHistoryQueryOptions,
  skillVersionQueryOptions,
} from "./query-options";

export const useSkillDetail = (skillName: string) =>
  useQuery({
    ...activeSkillQueryOptions(skillName),
    placeholderData: (previousSkill) =>
      previousSkill?.name === skillName ? previousSkill : undefined,
  });

export const useSkillFile = (
  skillName: string | undefined,
  path: string | undefined
) =>
  useQuery({
    enabled: Boolean(skillName && path),
    ...skillFileQueryOptions(skillName ?? "", path ?? ""),
  });

export const useSkillVersionHistory = (
  skillName: string | undefined,
  enabled: boolean
) =>
  useQuery({
    enabled: Boolean(skillName) && enabled,
    ...skillVersionHistoryQueryOptions(skillName ?? ""),
  });

export const useSkillVersion = (
  skillName: string | undefined,
  versionId: string | undefined,
  enabled: boolean
) =>
  useQuery({
    enabled: Boolean(skillName && versionId) && enabled,
    ...skillVersionQueryOptions(skillName ?? "", versionId ?? ""),
  });

export const useSkillVersionFile = (
  skillName: string | undefined,
  versionId: string | undefined,
  path: string | undefined,
  enabled: boolean
) =>
  useQuery({
    enabled: Boolean(skillName && versionId && path) && enabled,
    ...skillVersionFileQueryOptions(
      skillName ?? "",
      versionId ?? "",
      path ?? ""
    ),
  });
