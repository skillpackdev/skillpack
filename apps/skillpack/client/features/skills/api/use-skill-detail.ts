import { useQuery } from "@tanstack/react-query";

import {
  activeSkillQueryOptions,
  skillFileQueryOptions,
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
