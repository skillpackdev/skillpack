import { createApiKeySchema } from "@skillpack/contracts/api-keys/requests";
import {
  apiKeyListResponseSchema,
  createdApiKeyResponseSchema,
} from "@skillpack/contracts/api-keys/responses";
import { describe, expect, it } from "vitest";

describe("API key contracts", () => {
  it("accepts a named API key with an expiration", () => {
    const result = createApiKeySchema.safeParse({
      expiresAt: "2026-12-29T10:00:00.000Z",
      name: "Claude Desktop",
    });

    expect(result.success).toBeTruthy();
  });

  it("returns a secret only from the create response", () => {
    expect(
      createdApiKeyResponseSchema.safeParse({
        apiKey: {
          createdAt: "2026-06-29T10:00:00.000Z",
          expiresAt: "2026-12-29T10:00:00.000Z",
          id: "key_123",
          keyHint: "skp_abc123...wxyz",
          lastUsedAt: null,
          name: "Claude Desktop",
          revokedAt: null,
        },
        secret: "skp_abc123_full_secret_wxyz",
      }).success
    ).toBeTruthy();

    expect(
      apiKeyListResponseSchema.safeParse({
        apiKeys: [
          {
            createdAt: "2026-06-29T10:00:00.000Z",
            expiresAt: "2026-12-29T10:00:00.000Z",
            id: "key_123",
            keyHint: "skp_abc123...wxyz",
            lastUsedAt: null,
            name: "Claude Desktop",
            revokedAt: null,
            secret: "skp_abc123_full_secret_wxyz",
          },
        ],
      }).success
    ).toBeFalsy();
  });
});
