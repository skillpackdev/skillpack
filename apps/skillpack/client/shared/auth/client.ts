import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { queryOptions } from "@tanstack/react-query";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient({
  plugins: [genericOAuthClient(), oauthProviderClient()],
});

const oidcProviderId = "oidc";

export interface LoginProviders {
  github: boolean;
  oidc: boolean;
}

export interface OAuthClientPreview {
  client_id?: string;
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
}

const sessionStaleTimeMs = 5 * 60 * 1000;

export const sessionQueryKey = ["auth", "session"] as const;

export const loginProvidersQueryKey = ["auth", "login-providers"] as const;

export const publicOAuthClientQueryKey = (clientId: string | undefined) =>
  ["auth", "oauth-client", clientId] as const;

export const useSession = () => authClient.useSession();

export const getSession = () => authClient.getSession();

export type Session = NonNullable<
  Awaited<ReturnType<typeof getSession>>["data"]
>;

export const sessionQueryOptions = () =>
  queryOptions({
    queryFn: getSession,
    queryKey: sessionQueryKey,
    staleTime: sessionStaleTimeMs,
  });

export const getLoginProviders = async (): Promise<LoginProviders> => {
  const response = await fetch("/api/auth/login-providers");

  if (!response.ok) {
    throw new Error("Failed to load login providers");
  }

  const body: unknown = await response.json();

  if (
    !body ||
    typeof body !== "object" ||
    !("github" in body) ||
    typeof body.github !== "boolean" ||
    !("oidc" in body) ||
    typeof body.oidc !== "boolean"
  ) {
    throw new Error("Invalid login provider response");
  }

  return { github: body.github, oidc: body.oidc };
};

export const loginProvidersQueryOptions = () =>
  queryOptions({
    queryFn: getLoginProviders,
    queryKey: loginProvidersQueryKey,
  });

export const signInWithEmail = (
  email: string,
  password: string,
  callbackURL: string
) =>
  authClient.signIn.email({
    callbackURL,
    email,
    password,
  });

export const signInWithOidc = (callbackURL: string) =>
  authClient.signIn.oauth2({
    callbackURL,
    errorCallbackURL: "/login",
    providerId: oidcProviderId,
  });

export const signInWithGitHub = (callbackURL: string) =>
  authClient.signIn.social({
    callbackURL,
    errorCallbackURL: "/login",
    provider: "github",
  });

export const signOut = (onSuccess: () => void) =>
  authClient.signOut({
    fetchOptions: { onSuccess },
  });

export const getPublicOAuthClient = (clientId: string) =>
  authClient.$fetch("/oauth2/public-client-prelogin", {
    body: { client_id: clientId },
    method: "POST",
  });

export const fetchPublicOAuthClient = async (
  clientId: string
): Promise<OAuthClientPreview> => {
  const response = await getPublicOAuthClient(clientId);

  if (response.error) {
    throw new Error(response.error.message ?? "OAuth client not found");
  }

  return response.data as OAuthClientPreview;
};

export const publicOAuthClientQueryOptions = (clientId: string) =>
  queryOptions({
    queryFn: () => fetchPublicOAuthClient(clientId),
    queryKey: publicOAuthClientQueryKey(clientId),
  });

export const respondToOAuthConsent = (accept: boolean, scope?: string) =>
  authClient.$fetch<{ redirect: boolean; url: string }>("/oauth2/consent", {
    body: {
      accept,
      scope,
    },
    method: "POST",
  });
