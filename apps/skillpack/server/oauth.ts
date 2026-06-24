import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { verifyJwsAccessToken } from "better-auth/oauth2";

import { createAuth, skillReadScope } from "./auth";
import { getMcpOAuthResource, getOAuthResource } from "./oauth-audience";

export { getMcpOAuthResource, getOAuthResource } from "./oauth-audience";

export const getRequestOrigin = (url: string) => new URL(url).origin;

const getBearerToken = (headers: Headers) => {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
};

export const mcpProtectedResourceScopes = [
  "offline_access",
  skillReadScope,
] as const;

const hasScope = (scope: unknown, requiredScope: string) =>
  typeof scope === "string" && scope.split(" ").includes(requiredScope);

const getBearerUserId = async (
  env: Env,
  origin: string,
  headers: Headers,
  expectedResource: string
) => {
  const token = getBearerToken(headers);

  if (!token) {
    return;
  }

  const issuer = getOAuthResource(env, origin);
  const auth = createAuth(env, origin);
  const payload = await verifyJwsAccessToken(token, {
    jwksFetch: async () => await auth.api.getJwks({ headers }),
    verifyOptions: {
      audience: expectedResource,
      issuer,
    },
  });

  if (!hasScope(payload.scope, skillReadScope)) {
    return;
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    return;
  }

  return payload.sub;
};

export const getSkillReadBearerUserId = (
  env: Env,
  origin: string,
  headers: Headers
) => getBearerUserId(env, origin, headers, getOAuthResource(env, origin));

export const getMcpSkillReadBearerUserId = (
  env: Env,
  origin: string,
  headers: Headers
) => getBearerUserId(env, origin, headers, getMcpOAuthResource(env, origin));

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

export const getMcpProtectedResourceMetadata = async (
  env: Env,
  origin: string
) => {
  const resourceClient = oauthProviderResourceClient();
  const resource = getMcpOAuthResource(env, origin);
  const authorizationServer = new URL("/", resource).href.replace(/\/$/u, "");

  return await resourceClient.getActions().getProtectedResourceMetadata(
    {
      authorization_servers: [authorizationServer],
      bearer_methods_supported: ["header"],
      jwks_uri: `${authorizationServer}/api/auth/jwks`,
      resource,
      resource_name: "Skillpack MCP Server",
      scopes_supported: [...mcpProtectedResourceScopes],
    },
    {
      externalScopes: [...mcpProtectedResourceScopes],
      silenceWarnings: { oidcScopes: true },
    }
  );
};
