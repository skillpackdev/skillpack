import type {
  CreateSkillInput,
  CreateSkillSnapshotInput,
  ForkSkillInput,
  PatchSkillInput,
} from "@skillpack/contracts/skills/requests";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  skillListQueryKey,
  skillQueryPrefix,
  skillDetailQueryKey,
  skillFileQueryPrefix,
  skillSnapshotsQueryKey,
} from "./query-keys";
import {
  createManagedSkill,
  createManagedSkillSnapshot,
  forkManagedSkill,
  patchManagedSkill,
  restoreManagedSkillSnapshot,
} from "./requests";

const invalidateSkillQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  skillName: string | undefined
) => {
  await queryClient.invalidateQueries({ queryKey: skillQueryPrefix });
  await queryClient.invalidateQueries({
    queryKey: skillDetailQueryKey(skillName),
  });
  await queryClient.invalidateQueries({
    queryKey: skillFileQueryPrefix(skillName),
  });
  await queryClient.invalidateQueries({
    queryKey: skillSnapshotsQueryKey(skillName),
  });
};

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

export const useCreateSkillSnapshot = (skillName: string | undefined) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSkillSnapshotInput) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return createManagedSkillSnapshot(skillName, input);
    },
    onSuccess: async () => {
      await invalidateSkillQueries(queryClient, skillName);
    },
  });
};

export const useRestoreSkillSnapshot = (skillName: string | undefined) =>
  useMutation({
    mutationFn: (snapshotNumber: number) => {
      if (!skillName) {
        throw new Error("Missing Skill Name");
      }

      return restoreManagedSkillSnapshot(skillName, snapshotNumber);
    },
  });

export const useForkSkill = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ForkSkillInput) => forkManagedSkill(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: skillQueryPrefix });
    },
  });
};
