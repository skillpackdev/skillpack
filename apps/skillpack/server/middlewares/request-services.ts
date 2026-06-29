import { createDb } from "@server/db/client";
import { ApiKeyRepository } from "@server/modules/api-keys/repository";
import { ApiKeyService } from "@server/modules/api-keys/service";
import { OriginService } from "@server/modules/origins/service";
import { SkillStorage } from "@server/modules/skills/storage";
import type { AppBindings } from "@server/types";
import type { Context } from "hono";
import { env } from "hono/adapter";
import { createMiddleware } from "hono/factory";

export const setRequestServices = createMiddleware<AppBindings>(
  async (c, next) => {
    const runtimeEnv = env<
      { GITHUB_CLIENT_ID?: string; GITHUB_CLIENT_SECRET?: string },
      Context<AppBindings>
    >(c);
    const db = createDb(c.env.DB);
    const apiKeyService = new ApiKeyService(new ApiKeyRepository(db));
    const originService = new OriginService({
      githubClientId: runtimeEnv.GITHUB_CLIENT_ID,
      githubClientSecret: runtimeEnv.GITHUB_CLIENT_SECRET,
    });
    const skillStorage = new SkillStorage(c.env.BUCKET);

    c.set("apiKeyService", apiKeyService);
    c.set("db", db);
    c.set("originService", originService);
    c.set("skillStorage", skillStorage);
    await next();
  }
);
