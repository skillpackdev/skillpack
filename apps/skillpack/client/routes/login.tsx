import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { Github, KeyRound } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  loginProvidersQueryOptions,
  signInWithEmail,
  signInWithGitHub,
  signInWithOidc,
  useSession,
} from "@/shared/auth/client";
import type { LoginProviders } from "@/shared/auth/client";
import { getVisibleLoginProviders } from "@/shared/auth/login-providers";

const defaultCallbackURL = "/skills";
type LoginProvider = keyof LoginProviders;

const internalRedirectSchema = z
  .string()
  .refine((value) => value.startsWith("/") && !value.startsWith("//"));

const loginSearchSchema = z.object({
  redirect: internalRedirectSchema.optional(),
});

const getCallbackURL = (redirect: string | undefined) =>
  redirect ?? defaultCallbackURL;

/* eslint-disable no-use-before-define -- Route exposes typed route-local hooks from the file route declared below. */
const LoginRoute = () => {
  const session = useSession();
  const search = Route.useSearch();
  const providers = Route.useLoaderData();
  /* eslint-enable no-use-before-define */
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [isEmailPending, setIsEmailPending] = useState(false);
  const [activeProvider, setActiveProvider] = useState<LoginProvider>();
  const [password, setPassword] = useState("");
  const callbackURL = getCallbackURL(search.redirect);
  const visibleProviders = getVisibleLoginProviders(providers);
  const isLoginPending =
    session.isPending || isEmailPending || Boolean(activeProvider);

  useEffect(() => {
    if (session.data) {
      window.location.assign(callbackURL);
    }
  }, [callbackURL, session.data]);

  if (session.data) {
    return null;
  }

  const loginWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setIsEmailPending(true);

    const response = await signInWithEmail(email, password, callbackURL);

    if (response.error) {
      setError(response.error.message ?? "Email or password is incorrect");
      setIsEmailPending(false);
    }
  };

  const loginWithProvider = async (provider: LoginProvider) => {
    setError(undefined);
    setActiveProvider(provider);

    const response =
      provider === "github"
        ? await signInWithGitHub(callbackURL)
        : await signInWithOidc(callbackURL);

    if (response.error) {
      setError(response.error.message ?? "Login failed");
      setActiveProvider(undefined);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          </CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={(event) => void loginWithEmail(event)}>
            <FieldGroup className="gap-5">
              <Field data-disabled={isLoginPending}>
                <FieldLabel htmlFor="login-email">Email</FieldLabel>
                <Input
                  autoComplete="username"
                  disabled={isLoginPending}
                  id="login-email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </Field>

              <Field data-disabled={isLoginPending}>
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input
                  autoComplete="current-password"
                  disabled={isLoginPending}
                  id="login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </Field>

              {error ? <FieldError>{error}</FieldError> : null}

              <Button
                className="w-full"
                disabled={isLoginPending}
                type="submit"
              >
                {isEmailPending ? <Spinner data-icon="inline-start" /> : null}
                Sign in
              </Button>

              {visibleProviders.length > 0 ? (
                <>
                  <FieldSeparator>Or continue with</FieldSeparator>
                  <Field className="gap-2">
                    {visibleProviders.map((provider) => {
                      const ProviderIcon =
                        provider === "github" ? Github : KeyRound;

                      return (
                        <Button
                          className="w-full"
                          disabled={isLoginPending}
                          key={provider}
                          onClick={() => {
                            void loginWithProvider(provider);
                          }}
                          type="button"
                          variant="outline"
                        >
                          {activeProvider === provider ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <ProviderIcon data-icon="inline-start" />
                          )}
                          {provider === "github"
                            ? "Continue with GitHub"
                            : "Continue with OIDC"}
                        </Button>
                      );
                    })}
                  </Field>
                </>
              ) : null}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export const Route = createFileRoute("/login")({
  component: LoginRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(loginProvidersQueryOptions()),
  validateSearch: zodValidator(loginSearchSchema),
});
