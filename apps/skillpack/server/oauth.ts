import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";

import { skillReadScope } from "./auth";
import { getOAuthAudiences, getOAuthResource } from "./oauth-audience";

export { getOAuthAudiences, getOAuthResource } from "./oauth-audience";

export const getRequestOrigin = (url: string) => new URL(url).origin;

const getBearerToken = (headers: Headers) => {
  const authorization = headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || undefined;
};

export const getSkillReadBearerUserId = async (
  env: Env,
  origin: string,
  headers: Headers
) => {
  const token = getBearerToken(headers);

  if (!token) {
    return;
  }

  const resource = getOAuthResource(env, origin);
  const audiences = getOAuthAudiences(env, origin);
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

export const getProtectedResourceMetadata = async (
  env: Env,
  origin: string
) => {
  const resource = getOAuthResource(env, origin);
  const resourceClient = oauthProviderResourceClient();

  return await resourceClient.getActions().getProtectedResourceMetadata(
    {
      authorization_servers: [resource],
      bearer_methods_supported: ["header"],
      jwks_uri: `${resource}/api/auth/jwks`,
      resource,
      resource_name: "Skillpack Managed Skills",
      scopes_supported: [skillReadScope],
    },
    {
      externalScopes: [skillReadScope],
      silenceWarnings: { oidcScopes: true },
    }
  );
};
