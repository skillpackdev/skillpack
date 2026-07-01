import type {
  OriginSelectionInput,
  SkillOriginInput,
} from "@skillpack/contracts/origins/requests";
import type { ResolvedSkill } from "@skillpack/contracts/skills/responses";
import type { QueryKey } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import { getOriginQueryKeyPart } from "../lib/origin-url";
import {
  originDefinitionQueryKey,
  originDiscoveryQueryKey,
  skillDetailQueryKey,
  skillFileQueryKey,
  skillListQueryKey,
} from "./query-keys";
import {
  discoverOriginSkills,
  fetchSkillDetail,
  fetchSkillFile,
  fetchSkillList,
  readSkillDefinitions,
} from "./requests";

const originStaleTimeMs = 60_000;

export const skillListQueryOptions = () =>
  queryOptions({
    queryFn: fetchSkillList,
    queryKey: skillListQueryKey,
  });

export const activeSkillQueryOptions = (skillName: string) =>
  queryOptions<ResolvedSkill, Error, ResolvedSkill, QueryKey>({
    queryFn: () => fetchSkillDetail(skillName),
    queryKey: skillDetailQueryKey(skillName),
  });

export const skillFileQueryOptions = (skillName: string, path: string) =>
  queryOptions({
    queryFn: () => fetchSkillFile(skillName, path),
    queryKey: skillFileQueryKey(skillName, path),
  });

export const originDiscoveryQueryOptions = (origin: SkillOriginInput) => {
  const originKey = getOriginQueryKeyPart(origin);

  return queryOptions({
    queryFn: () => discoverOriginSkills(origin),
    queryKey: originDiscoveryQueryKey(originKey),
    staleTime: originStaleTimeMs,
  });
};

export const originDefinitionQueryOptions = (
  origin: SkillOriginInput,
  selection: OriginSelectionInput
) => {
  const originKey = getOriginQueryKeyPart(origin);

  return queryOptions({
    queryFn: async () => {
      const response = await readSkillDefinitions({
        origin,
        selections: [selection],
      });
      const result = response.results.at(0);

      if (!result) {
        throw new Error("Missing Skill Origin Definition Result");
      }

      return result;
    },
    queryKey: originDefinitionQueryKey(originKey, selection.skillName),
    staleTime: originStaleTimeMs,
  });
};
