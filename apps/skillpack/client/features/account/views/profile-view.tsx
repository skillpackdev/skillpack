import { LogOutIcon } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { signOut } from "@/shared/auth/client";
import type { Session } from "@/shared/auth/client";

interface ProfileViewProps {
  session: Session;
}

const signOutAndRedirect = async () => {
  await signOut(() => {
    window.location.assign("/login");
  });
};

const formatUserValue = (value: null | string | undefined) =>
  value && value.trim().length > 0 ? value : "Not provided";

export const ProfileView = ({ session }: ProfileViewProps) => {
  const rawName = session.user.name;
  const userName = formatUserValue(rawName);
  const userEmail = formatUserValue(session.user.email);
  const userImage = session.user.image;
  const userInitial =
    rawName && rawName.trim().length > 0
      ? rawName.trim().charAt(0).toUpperCase()
      : "?";

  return (
    <>
      <header className="h-(--app-shell-header-height) shrink-0 border-b border-border bg-background px-4 md:px-6">
        <div className="flex h-full items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              Profile
            </h1>
          </div>
        </div>
      </header>

      <OverlayScrollbarsComponent
        defer
        options={{ scrollbars: { autoHide: "leave", theme: "os-theme-dark" } }}
        className="min-h-0 flex-1"
      >
        <main className="min-h-full bg-background px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
            <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-xs md:flex-row md:items-center md:justify-between md:p-6">
              <div className="flex min-w-0 items-center gap-4">
                <Avatar className="size-14" size="lg">
                  {userImage ? <AvatarImage src={userImage} alt="" /> : null}
                  <AvatarFallback>{userInitial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold tracking-tight">
                    {userName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void signOutAndRedirect();
                }}
              >
                <LogOutIcon data-icon="inline-start" />
                Sign out
              </Button>
            </section>

            <Card className="shadow-none">
              <CardHeader>
                <CardTitle>Account details</CardTitle>
                <CardDescription>
                  Basic information from your current authenticated session.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-0 overflow-hidden rounded-xl border border-border md:grid-cols-2">
                  <div className="border-border border-b p-4 md:border-r md:border-b-0">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Name
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium">
                      {userName}
                    </dd>
                  </div>
                  <div className="p-4">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Email
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium">
                      {userEmail}
                    </dd>
                  </div>
                </dl>
                <Separator className="my-5" />
                <p className="text-sm leading-6 text-muted-foreground">
                  API access is managed separately, so credentials can be
                  rotated without changing your sign-in session.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </OverlayScrollbarsComponent>
    </>
  );
};
