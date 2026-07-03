import { Navigate, createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useMemo, useState } from "react";
import { z } from "zod";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Spinner,
} from "@/components/ui";
import {
  publicOAuthClientQueryOptions,
  respondToOAuthConsent,
  useSession,
} from "@/shared/auth/client";
import type { OAuthClientPreview } from "@/shared/auth/client";

const clientIdSchema = z.string().min(1);
const skillReadScope = "skills:read";

const oauthConsentSearchSchema = z.object({
  client_id: clientIdSchema,
  scope: z.string().default(""),
});

const parseScopes = (scope: string | null) =>
  scope
    ?.split(" ")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const getClientName = (client?: OAuthClientPreview) =>
  client?.client_name ?? client?.client_id ?? "OAuth client";

/* eslint-disable no-use-before-define -- Route exposes typed route-local hooks from the file route declared below. */
const OAuthConsentRoute = () => {
  const session = useSession();
  const search = Route.useSearch();
  const client = Route.useLoaderData();
  /* eslint-enable no-use-before-define */
  const scopes = useMemo(() => parseScopes(search.scope), [search.scope]);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session.isPending) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6">
        <Spinner />
      </main>
    );
  }

  if (!session.data) {
    const redirectSearchParams = new URLSearchParams();

    redirectSearchParams.set("client_id", search.client_id);

    if (search.scope) {
      redirectSearchParams.set("scope", search.scope);
    }

    const redirect = `/oauth/consent?${redirectSearchParams.toString()}`;
    return <Navigate replace search={{ redirect }} to="/login" />;
  }

  const submitConsent = async (accept: boolean) => {
    setError(undefined);
    setIsSubmitting(true);

    try {
      const response = await respondToOAuthConsent(
        accept,
        accept ? scopes.join(" ") : undefined
      );

      if (response.error) {
        setError(response.error.message ?? "OAuth consent failed");
        return;
      }

      window.location.assign(response.data.url);
    } catch {
      setError("OAuth consent failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">skillpack</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Authorize access
          </h1>
          <p className="text-sm text-muted-foreground">
            {getClientName(client)} wants read access to your Skill Library.
          </p>
        </div>

        <div className="mt-6 space-y-3 rounded-md border border-border p-4">
          <div>
            <p className="text-sm font-medium">Requested access</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Read your Managed Skills and their resources.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {scopes.includes(skillReadScope) ? (
              <Badge variant="outline">{skillReadScope}</Badge>
            ) : null}
            {scopes
              .filter((scope) => scope !== skillReadScope)
              .map((scope) => (
                <Badge key={scope} variant="secondary">
                  {scope}
                </Badge>
              ))}
          </div>
        </div>

        {error ? (
          <Alert className="mt-4" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1"
            disabled={isSubmitting || Boolean(error && !client)}
            onClick={() => {
              void submitConsent(true);
            }}
          >
            Allow
          </Button>
          <Button
            className="flex-1"
            disabled={isSubmitting || Boolean(error && !client)}
            onClick={() => {
              void submitConsent(false);
            }}
            variant="outline"
          >
            Deny
          </Button>
        </div>
      </section>
    </main>
  );
};

export const Route = createFileRoute("/oauth/consent")({
  component: OAuthConsentRoute,

  loaderDeps: ({ search }) => ({
    clientId: search.client_id,
  }),

  loader: ({ context, deps }) => {
    const { clientId } = deps;

    return context.queryClient.ensureQueryData(
      publicOAuthClientQueryOptions(clientId)
    );
  },
  validateSearch: zodValidator(oauthConsentSearchSchema),
});
