import {
  apiKeyListResponseSchema,
  apiKeySummarySchema,
  createdApiKeyResponseSchema,
} from "@skillpack/contracts/api-keys/responses";

import type { ApiKeyRecord, CreatedApiKey } from "./types";

const toIsoString = (date: Date) => date.toISOString();

export const presentApiKey = (apiKey: ApiKeyRecord) =>
  apiKeySummarySchema.parse({
    createdAt: toIsoString(apiKey.createdAt),
    expiresAt: toIsoString(apiKey.expiresAt),
    id: apiKey.id,
    keyHint: apiKey.keyHint,
    lastUsedAt: apiKey.lastUsedAt ? toIsoString(apiKey.lastUsedAt) : null,
    name: apiKey.name,
    revokedAt: apiKey.revokedAt ? toIsoString(apiKey.revokedAt) : null,
  });

export const presentApiKeyList = (apiKeys: ApiKeyRecord[]) =>
  apiKeyListResponseSchema.parse({
    apiKeys: apiKeys.map(presentApiKey),
  });

export const presentCreatedApiKey = (createdApiKey: CreatedApiKey) =>
  createdApiKeyResponseSchema.parse({
    apiKey: presentApiKey(createdApiKey.apiKey),
    secret: createdApiKey.secret,
  });
