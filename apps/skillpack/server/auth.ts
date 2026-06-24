import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { genericOAuth, jwt } from "better-auth/plugins";

import { getMcpOAuthResource } from "./oauth-audience";

export const skillReadScope = "skills:read";
export const skillpackOAuthScopes = [
  "openid",
  "offline_access",
  skillReadScope,
];

const providerId = "oidc";
const defaultScopes = ["openid", "email", "profile"];

export const accountLinkingOptions = {
  enabled: true,
  // Temporary v1 shortcut: trust browser sign-in providers, while still requiring
  // Better Auth's email-verified checks. Replace this with an explicit
  // account-linking flow before adding more providers.
  trustedProviders: ["github", "oidc"],
};

const getProfileValue = (profile: Record<string, unknown>, key: string) => {
  const value = profile[key];
  return typeof value === "string" && value ? value : undefined;
};

const getProfileName = (profile: Record<string, unknown>) =>
  getProfileValue(profile, "name") ??
  getProfileValue(profile, "preferred_username") ??
  getProfileValue(profile, "email") ??
  "User";

const mapProfileToUser = (profile: Record<string, unknown>) => ({
  email: getProfileValue(profile, "email") ?? "",
  emailVerified: Boolean(profile.email_verified),
  image: getProfileValue(profile, "picture") ?? null,
  name: getProfileName(profile),
});

const requiredEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} is required for auth`);
  }

  return value;
};

const getOptionalEnvPair = (
  env: Env,
  firstName: "GITHUB_CLIENT_ID" | "OIDC_CLIENT_ID",
  secondName: "GITHUB_CLIENT_SECRET" | "OIDC_DISCOVERY_URL"
) => {
  const firstValue = env[firstName]?.trim();
  const secondValue = env[secondName]?.trim();

  if (Boolean(firstValue) !== Boolean(secondValue)) {
    throw new Error(
      `Both ${firstName} and ${secondName} are required for auth`
    );
  }

  if (!(firstValue && secondValue)) {
    return;
  }

  return { firstValue, secondValue };
};

export const getLoginProviders = (env: Env) => ({
  github: Boolean(
    getOptionalEnvPair(env, "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET")
  ),
  oidc: Boolean(
    getOptionalEnvPair(env, "OIDC_CLIENT_ID", "OIDC_DISCOVERY_URL")
  ),
});

export const createAuth = (env: Env, origin: string) => {
  const baseURL = env.AUTH_BASE_URL ?? origin;
  const githubConfig = getOptionalEnvPair(
    env,
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET"
  );
  const oidcConfig = getOptionalEnvPair(
    env,
    "OIDC_CLIENT_ID",
    "OIDC_DISCOVERY_URL"
  );

  return betterAuth({
    account: {
      accountLinking: accountLinkingOptions,
    },
    baseURL,
    database: env.DB,
    plugins: [
      jwt({
        disableSettingJwtHeader: true,
        jwt: { issuer: baseURL },
      }),
      oauthProvider({
        allowDynamicClientRegistration: true,
        allowPublicClientPrelogin: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationAllowedScopes: skillpackOAuthScopes,
        clientRegistrationDefaultScopes: skillpackOAuthScopes,
        consentPage: "/oauth/consent",
        grantTypes: ["authorization_code", "refresh_token"],
        loginPage: "/login",
        scopes: skillpackOAuthScopes,
        silenceWarnings: {
          oauthAuthServerConfig: true,
          openidConfig: true,
        },
        validAudiences: [getMcpOAuthResource(env, origin)],
      }),
      ...(oidcConfig
        ? [
            genericOAuth({
              config: [
                {
                  clientId: oidcConfig.firstValue,
                  discoveryUrl: oidcConfig.secondValue,
                  mapProfileToUser,
                  pkce: true,
                  providerId,
                  scopes: defaultScopes,
                },
              ],
            }),
          ]
        : []),
    ],
    secret: requiredEnv(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET"),
    socialProviders: githubConfig
      ? {
          github: {
            clientId: githubConfig.firstValue,
            clientSecret: githubConfig.secondValue,
          },
        }
      : {},
    trustedOrigins: [baseURL, origin],
  });
};

export type AuthSession = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
>;
