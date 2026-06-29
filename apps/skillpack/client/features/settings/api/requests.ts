import type { CreateApiKeyInput } from "@skillpack/contracts/api-keys/requests";
import {
  apiKeyListResponseSchema,
  createdApiKeyResponseSchema,
} from "@skillpack/contracts/api-keys/responses";
import type {
  ApiKeyListResponse,
  CreatedApiKeyResponse,
} from "@skillpack/contracts/api-keys/responses";

import { api } from "@/shared/api/client";

export const fetchApiKeys = async (): Promise<ApiKeyListResponse> => {
  const data = await api.get("api-keys").json();
  return apiKeyListResponseSchema.parse(data);
};

export const createApiKey = async (
  input: CreateApiKeyInput
): Promise<CreatedApiKeyResponse> => {
  const data = await api.post("api-keys", { json: input }).json();
  return createdApiKeyResponseSchema.parse(data);
};

export const revokeApiKey = async (apiKeyId: string): Promise<void> => {
  await api.delete(`api-keys/${apiKeyId}`);
};
