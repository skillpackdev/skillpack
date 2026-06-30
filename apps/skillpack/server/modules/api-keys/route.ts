import { zValidator } from "@hono/zod-validator";
import { apiError } from "@server/lib/http";
import type { AppBindings } from "@server/types";
import { createApiKeySchema } from "@skillpack/contracts/api-keys/requests";
import { Hono } from "hono";
import type { Context } from "hono";

import { ApiKeyModuleError } from "./errors";
import {
  presentApiKeyList,
  presentCreatedApiKey,
  presentApiKey,
} from "./presenter";

const apiKeyErrorStatus = {
  "api-key-not-found": 404,
  "invalid-api-key-expiration": 400,
} as const;

type ApiKeyContext = Context<AppBindings>;

const handleApiKeyRouteError = (error: Error, c: ApiKeyContext) => {
  if (error instanceof ApiKeyModuleError) {
    return c.json(apiError(error.message), apiKeyErrorStatus[error.code]);
  }

  throw error;
};

export const apiKeysRoute = new Hono<AppBindings>()
  .onError(handleApiKeyRouteError)
  .get("/", async (c) => {
    const apiKeys = await c.var.apiKeyService.listApiKeys(c.var.currentUser.id);
    return c.json(presentApiKeyList(apiKeys));
  })
  .post("/", zValidator("json", createApiKeySchema), async (c) => {
    const createdApiKey = await c.var.apiKeyService.createApiKey(
      c.var.currentUser.id,
      c.req.valid("json")
    );
    return c.json(presentCreatedApiKey(createdApiKey), 201);
  })
  .delete("/:apiKeyId", async (c) => {
    const apiKey = await c.var.apiKeyService.revokeApiKey(
      c.var.currentUser.id,
      c.req.param("apiKeyId")
    );
    return c.json(presentApiKey(apiKey));
  });
