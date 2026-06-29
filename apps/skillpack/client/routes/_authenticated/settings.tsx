import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import {
  SettingsView,
  apiKeyListQueryOptions,
  useApiKeys,
} from "@/features/settings";

const SettingsSkeleton = () => (
  <main className="flex min-h-svh flex-col gap-6 p-4 md:p-8">
    <div className="flex flex-col gap-2">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-5 w-80 max-w-full" />
    </div>
    <Skeleton className="h-56 w-full max-w-6xl" />
    <Skeleton className="h-80 w-full max-w-6xl" />
  </main>
);

const SettingsRoute = () => {
  const apiKeys = useApiKeys();

  if (apiKeys.isPending) {
    return <SettingsSkeleton />;
  }

  return <SettingsView apiKeys={apiKeys.data ?? []} />;
};

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsRoute,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(apiKeyListQueryOptions()),
});
