import { Outlet, createFileRoute } from "@tanstack/react-router";

const ProfileLayoutRoute = () => <Outlet />;

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfileLayoutRoute,
});
