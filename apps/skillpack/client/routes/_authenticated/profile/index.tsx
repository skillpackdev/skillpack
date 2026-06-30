import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { ProfileView } from "@/features/account";

const ProfileRoute = () => {
  const { session } = useRouteContext({ from: "/_authenticated" });

  return <ProfileView session={session} />;
};

export const Route = createFileRoute("/_authenticated/profile/")({
  component: ProfileRoute,
});
