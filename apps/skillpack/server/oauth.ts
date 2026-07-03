import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { verifyJwsAccessToken } from "better-auth/oauth2";

import { createAuth, skillReadScope, skillWriteScope } from "./auth";
import { getOAuthResource } from "./oauth-audience";

export { getOAuthResource } from "./oauth-audience";

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
  skillWriteScope,
] as const;

const hasScope = (scope: unknown, requiredScope: string) =>
  typeof scope === "string" && scope.split(" ").includes(requiredScope);

export interface SkillBearerAccess {
  canWrite: boolean;
  userId: string;
}

const getBearerAccess = async (
  env: Env,
  origin: string,
  headers: Headers,
  expectedResource: string
): Promise<SkillBearerAccess | undefined> => {
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

  return {
    canWrite: hasScope(payload.scope, skillWriteScope),
    userId: payload.sub,
  };
};

export const getSkillBearerAccess = (
  env: Env,
  origin: string,
  headers: Headers
) => getBearerAccess(env, origin, headers, getOAuthResource(env, origin));

export const getSkillReadBearerUserId = async (
  env: Env,
  origin: string,
  headers: Headers
) => {
  const access = await getSkillBearerAccess(env, origin, headers);
  return access?.userId;
};

const getResourceMetadata = async (
  resource: string,
  resourceName: string,
  scopes: readonly string[]
) => {
  const resourceClient = oauthProviderResourceClient();
  const authorizationServer = new URL("/", resource).href.replace(/\/$/u, "");

  return await resourceClient.getActions().getProtectedResourceMetadata(
    {
      authorization_servers: [authorizationServer],
      bearer_methods_supported: ["header"],
      jwks_uri: `${authorizationServer}/api/auth/jwks`,
      resource,
      resource_name: resourceName,
      scopes_supported: [...scopes],
    },
    {
      externalScopes: [...scopes],
      silenceWarnings: { oidcScopes: true },
    }
  );
};

export const getProtectedResourceMetadata = (env: Env, origin: string) =>
  getResourceMetadata(
    getOAuthResource(env, origin),
    "Skillpack Managed Skills",
    [skillReadScope, skillWriteScope]
  );

export const getMcpProtectedResourceMetadata = (env: Env, origin: string) =>
  getResourceMetadata(
    getOAuthResource(env, origin),
    "Skillpack MCP Server",
    mcpProtectedResourceScopes
  );
