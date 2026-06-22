import { Hono } from "hono";
import type { Context } from "hono";
import { contextStorage } from "hono/context-storage";

import { createAuth, getLoginProviders } from "./auth";
import {
  createRequireMcpAuth,
  createRequireSessionAuth,
  createRequireSkillsAuth,
} from "./middlewares/auth";
import type { AuthMiddlewareOptions } from "./middlewares/auth";
import { setRequestServices } from "./middlewares/request-services";
import { mcpRoute } from "./modules/mcp/route";
import {
  getMcpProtectedResourceMetadata,
  getProtectedResourceMetadata,
  getRequestOrigin,
} from "./oauth";
import { apiRoutes } from "./routes";
import type { AppBindings } from "./types";

const authHandler = (c: Context<AppBindings>) => {
  const origin = getRequestOrigin(c.req.url);
  return createAuth(c.env, origin).handler(c.req.raw);
};

const oauthAuthorizationServerMetadata = async (c: Context<AppBindings>) => {
  const origin = getRequestOrigin(c.req.url);
  const metadata = await createAuth(c.env, origin).api.getOAuthServerConfig({
    headers: c.req.raw.headers,
  });
  return c.json(metadata);
};

const openIdConfigurationMetadata = async (c: Context<AppBindings>) => {
  const origin = getRequestOrigin(c.req.url);
  const metadata = await createAuth(c.env, origin).api.getOpenIdConfig({
    headers: c.req.raw.headers,
  });
  return c.json(metadata);
};

const protectedResourceMetadata = async (c: Context<AppBindings>) => {
  const origin = getRequestOrigin(c.req.url);
  const metadata = await getProtectedResourceMetadata(c.env, origin);
  return c.json(metadata);
};

const mcpProtectedResourceMetadata = async (c: Context<AppBindings>) => {
  const origin = getRequestOrigin(c.req.url);
  const metadata = await getMcpProtectedResourceMetadata(c.env, origin);
  return c.json(metadata);
};

const loginProviders = (c: Context<AppBindings>) =>
  c.json(getLoginProviders(c.env));

export const createApp = (options: AuthMiddlewareOptions = {}) =>
  new Hono<AppBindings>()
    .use(contextStorage())
    .use(setRequestServices)
    .get(
      "/.well-known/oauth-authorization-server",
      oauthAuthorizationServerMetadata
    )
    .get("/.well-known/openid-configuration", openIdConfigurationMetadata)
    .get(
      "/.well-known/oauth-protected-resource/mcp",
      mcpProtectedResourceMetadata
    )
    .get("/.well-known/oauth-protected-resource", protectedResourceMetadata)
    .get("/api/auth/login-providers", loginProviders)
    .on(["GET", "POST"], "/api/auth/*", authHandler)
    .use("/api/v1/origins", createRequireSessionAuth())
    .use("/api/v1/origins/*", createRequireSessionAuth())
    .use("/api/v1/skills/*", createRequireSkillsAuth(options))
    .use("/mcp", createRequireMcpAuth(options))
    .route("/mcp", mcpRoute)
    .route("/", apiRoutes);

export const app = createApp();
