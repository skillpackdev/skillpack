import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiKeysView,
  apiKeyListQueryOptions,
  useApiKeys,
} from "@/features/account";

const ApiKeysSkeleton = () => (
  <main className="flex min-h-svh flex-col gap-6 p-4 md:p-8">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-5 w-80 max-w-full" />
    </div>
    <Skeleton className="h-56 w-full max-w-6xl" />
    <Skeleton className="h-80 w-full max-w-6xl" />
  </main>
);

const ApiKeysRoute = () => {
  const apiKeys = useApiKeys();

  if (apiKeys.isPending) {
    return <ApiKeysSkeleton />;
  }

  return <ApiKeysView apiKeys={apiKeys.data ?? []} />;
};

export const Route = createFileRoute("/_authenticated/profile/api-keys")({
  component: ApiKeysRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(apiKeyListQueryOptions()),
});
