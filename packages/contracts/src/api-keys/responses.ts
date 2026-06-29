import { z } from "zod";

import { apiKeyNameSchema } from "./requests";

export const apiKeySummarySchema = z
  .object({
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    id: z.string().min(1),
    keyHint: z.string().min(1),
    lastUsedAt: z.string().datetime().nullable(),
    name: apiKeyNameSchema,
    revokedAt: z.string().datetime().nullable(),
  })
  .strict();

export const apiKeyListResponseSchema = z
  .object({
    apiKeys: z.array(apiKeySummarySchema),
  })
  .strict();

export const createdApiKeyResponseSchema = z
  .object({
    apiKey: apiKeySummarySchema,
    secret: z.string().min(1),
  })
  .strict();

export type ApiKeyListResponse = z.infer<typeof apiKeyListResponseSchema>;
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;
export type CreatedApiKeyResponse = z.infer<typeof createdApiKeyResponseSchema>;
