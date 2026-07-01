import type { QueryClient } from "@tanstack/react-query";

import {
  skillDetailQueryKey,
  skillFileQueryPrefix,
  skillListQueryKey,
  skillVersionHistoryQueryPrefix,
} from "./query-keys";

export const cancelManagedSkillCurrentQueries = async (
  queryClient: QueryClient,
  skillName: string
) => {
  await queryClient.cancelQueries({ queryKey: skillDetailQueryKey(skillName) });
  await queryClient.cancelQueries({
    queryKey: skillFileQueryPrefix(skillName),
  });
};

export const invalidateManagedSkillQueries = async (
  queryClient: QueryClient,
  skillName: string | undefined
) => {
  await queryClient.invalidateQueries({ queryKey: skillListQueryKey });

  if (!skillName) {
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: skillDetailQueryKey(skillName) }),
    queryClient.invalidateQueries({
      queryKey: skillFileQueryPrefix(skillName),
    }),
    queryClient.invalidateQueries({
      queryKey: skillVersionHistoryQueryPrefix(skillName),
    }),
  ]);
};
