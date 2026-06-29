import { z } from "zod";

export const apiKeyNameSchema = z.string().trim().min(1).max(120);

export const createApiKeySchema = z.object({
  expiresAt: z.string().datetime(),
  name: apiKeyNameSchema,
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
