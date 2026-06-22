import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

import { skillReadScope } from "./auth";
import {
  getMcpOAuthAudiences,
  getMcpOAuthResource,
  getOAuthAudiences,
  getOAuthResource,
} from "./oauth-audience";

export {
  getMcpOAuthAudiences,
  getMcpOAuthResource,
  getOAuthAudiences,
  getOAuthResource,
} from "./oauth-audience";

export const getRequestOrigin = (url: string) => new URL(url).origin;

const getBearerToken = (headers: Headers) => {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
};

const getBearerUserId = async (
  env: Env,
  origin: string,
  headers: Headers,
  audiences: string[]
) => {
  const token = getBearerToken(headers);

  if (!token) {
    return;
  }

  const resource = getOAuthResource(env, origin);
  const resourceClient = oauthProviderResourceClient();
  const payload = await resourceClient.getActions().verifyAccessToken(token, {
    jwksUrl: `${resource}/api/auth/jwks`,
    scopes: [skillReadScope],
    verifyOptions: {
      audience: audiences,
      issuer: resource,
    },
  });

  if (typeof payload.sub !== "string" || !payload.sub) {
    return;
  }

  return payload.sub;
};

export const getSkillReadBearerUserId = (
  env: Env,
  origin: string,
  headers: Headers
) => getBearerUserId(env, origin, headers, getOAuthAudiences(env, origin));

export const getMcpSkillReadBearerUserId = (
  env: Env,
  origin: string,
  headers: Headers
) => getBearerUserId(env, origin, headers, getMcpOAuthAudiences(env, origin));

const getResourceMetadata = async (resource: string, resourceName: string) => {
  const resourceClient = oauthProviderResourceClient();
  const authorizationServer = new URL("/", resource).href.replace(/\/$/u, "");

  return await resourceClient.getActions().getProtectedResourceMetadata(
    {
      authorization_servers: [authorizationServer],
      bearer_methods_supported: ["header"],
      jwks_uri: `${authorizationServer}/api/auth/jwks`,
      resource,
      resource_name: resourceName,
      scopes_supported: [skillReadScope],
    },
    {
      externalScopes: [skillReadScope],
      silenceWarnings: { oidcScopes: true },
    }
  );
};

export const getProtectedResourceMetadata = (env: Env, origin: string) =>
  getResourceMetadata(
    getOAuthResource(env, origin),
    "Skillpack Managed Skills"
  );

export const getMcpProtectedResourceMetadata = (env: Env, origin: string) =>
  getResourceMetadata(getMcpOAuthResource(env, origin), "Skillpack MCP Server");
