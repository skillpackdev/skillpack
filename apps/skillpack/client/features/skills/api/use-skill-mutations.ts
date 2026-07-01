import type {
  CreateSkillInput,
  ForkSkillInput,
  PatchSkillInput,
  SkillVersionLabelInput,
} from "@skillpack/contracts/skills/requests";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateManagedSkillQueries } from "./invalidation";
import { skillQueryPrefix, skillVersionHistoryQueryPrefix } from "./query-keys";
import {
  createManagedSkill,
  deleteSkillVersionLabel,
  forkManagedSkill,
  patchManagedSkill,
  restoreSkillVersion,
  upsertSkillVersionLabel,
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
      await invalidateManagedSkillQueries(queryClient, skillName);
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

export const useUpsertSkillVersionLabel = (skillName: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SkillVersionLabelInput & { versionId: string }) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return upsertSkillVersionLabel(skillName, input.versionId, {
        label: input.label,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: skillVersionHistoryQueryPrefix(skillName),
      });
    },
  });
};

export const useDeleteSkillVersionLabel = (skillName: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return deleteSkillVersionLabel(skillName, versionId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: skillVersionHistoryQueryPrefix(skillName),
      });
    },
  });
};

export const useRestoreSkillVersion = (skillName: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (versionId: string) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return restoreSkillVersion(skillName, versionId);
    },
    onSuccess: async () => {
      await invalidateManagedSkillQueries(queryClient, skillName);
    },
  });
};
