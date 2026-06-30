import type { CreateApiKeyInput } from "@skillpack/contracts/api-keys/requests";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiKeyListQueryKey } from "./query-keys";
import { apiKeyListQueryOptions } from "./query-options";
import { createApiKey, revokeApiKey } from "./requests";

export const useApiKeys = () =>
  useQuery({
    ...apiKeyListQueryOptions(),
    select: (data) => data.apiKeys,
  });

export const useCreateApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => createApiKey(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeyListQueryKey });
    },
  });
};

export const useRevokeApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (apiKeyId: string) => revokeApiKey(apiKeyId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: apiKeyListQueryKey });
    },
  });
};
