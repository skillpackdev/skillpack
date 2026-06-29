import type { AppBindings } from "@server/types";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { apiKeysRoute } from "./route";
import type { ApiKeyService } from "./service";

const createApp = (apiKeyService: Partial<ApiKeyService>) =>
  new Hono<AppBindings>()
    .use(async (c, next) => {
      c.set("currentUser", { id: "user-a" });
      c.set("apiKeyService", apiKeyService as ApiKeyService);
      await next();
    })
    .route("/api-keys", apiKeysRoute);

const apiKeyRecord = {
  createdAt: new Date("2026-06-29T10:00:00.000Z"),
  expiresAt: new Date("2026-12-29T10:00:00.000Z"),
  id: "key_123",
  keyHash: "hash",
  keyHint: "skp_abc123...wxyz",
  lastUsedAt: null,
  name: "Claude Desktop",
  ownerUserId: "user-a",
  revokedAt: null,
};

describe("API key management route", () => {
  it("lists key summaries without secrets", async () => {
    const listApiKeys = vi
      .fn<ApiKeyService["listApiKeys"]>()
      .mockResolvedValue([apiKeyRecord]);
    const app = createApp({ listApiKeys });

    const response = await app.request("/api-keys");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      apiKeys: [
        {
          createdAt: "2026-06-29T10:00:00.000Z",
          expiresAt: "2026-12-29T10:00:00.000Z",
          id: "key_123",
          keyHint: "skp_abc123...wxyz",
          lastUsedAt: null,
          name: "Claude Desktop",
          revokedAt: null,
        },
      ],
    });
    expect(listApiKeys).toHaveBeenCalledWith("user-a");
  });

  it("returns the secret only when a key is created", async () => {
    const createApiKey = vi
      .fn<ApiKeyService["createApiKey"]>()
      .mockResolvedValue({ apiKey: apiKeyRecord, secret: "skp_secret" });
    const app = createApp({ createApiKey });

    const response = await app.request("/api-keys", {
      body: JSON.stringify({
        expiresAt: "2026-12-29T10:00:00.000Z",
        name: "Claude Desktop",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      apiKey: { id: "key_123", name: "Claude Desktop" },
      secret: "skp_secret",
    });
    expect(createApiKey).toHaveBeenCalledWith("user-a", {
      expiresAt: "2026-12-29T10:00:00.000Z",
      name: "Claude Desktop",
    });
  });

  it("revokes keys by owner", async () => {
    const revokeApiKey = vi
      .fn<ApiKeyService["revokeApiKey"]>()
      .mockResolvedValue({
        ...apiKeyRecord,
        revokedAt: new Date("2026-06-29T11:00:00.000Z"),
      });
    const app = createApp({ revokeApiKey });

    const response = await app.request("/api-keys/key_123", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "key_123",
      revokedAt: "2026-06-29T11:00:00.000Z",
    });
    expect(revokeApiKey).toHaveBeenCalledWith("user-a", "key_123");
  });
});
