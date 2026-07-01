import type {
  CreateSkillInput,
  ForkSkillInput,
  PatchSkillInput,
} from "@skillpack/contracts/skills/requests";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { skillListQueryKey, skillQueryPrefix } from "./query-keys";
import {
  createManagedSkill,
  forkManagedSkill,
  patchManagedSkill,
} from "./requests";

export const useCreateSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSkillInput) => createManagedSkill(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillQueryPrefix });
    },
  });
};

export const usePatchSkill = (skillName: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PatchSkillInput) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return patchManagedSkill(skillName, input);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillListQueryKey });
    },
  });
};

export const useForkSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ForkSkillInput) => forkManagedSkill(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillQueryPrefix });
    },
  });
};
