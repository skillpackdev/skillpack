import { Link, useLocation } from "@tanstack/react-router";
import { KeyRoundIcon, LibraryIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Session } from "@/shared/auth/client";

export const AppSidebar = ({ session }: { session: Session }) => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { setOpenMobile } = useSidebar();
  const isManagedSkillsActive = pathname.startsWith("/skills");
  const isProfileActive = pathname === "/profile" || pathname === "/profile/";
  const isApiKeysActive = pathname.startsWith("/profile/api-keys");
  const userName = session.user.name ?? "Account";
  const userImage = session.user.image;
  const userInitial = userName.trim().charAt(0).toUpperCase() || "A";

  return (
    <Sidebar
      collapsible="offcanvas"
      className="h-svh border-r border-sidebar-border bg-sidebar"
    >
      <SidebarHeader className="h-(--app-shell-header-height) justify-center gap-1 border-b border-sidebar-border px-4 py-0 text-sidebar-foreground">
        <span className="text-lg font-semibold tracking-tight">skillpack</span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isManagedSkillsActive}
                  size="lg"
                  tooltip="Library"
                  className="font-medium"
                  render={<Link to="/skills" />}
                  onClick={() => setOpenMobile(false)}
                >
                  <LibraryIcon />
                  <span>Library</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isApiKeysActive}
              size="lg"
              tooltip="API keys"
              className="font-medium"
              render={<Link to="/profile/api-keys" />}
              onClick={() => setOpenMobile(false)}
            >
              <KeyRoundIcon />
              <span>API keys</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isProfileActive}
              size="lg"
              tooltip="Profile"
              className="font-medium"
              render={<Link to="/profile" />}
              onClick={() => setOpenMobile(false)}
            >
              <Avatar size="sm">
                {userImage ? <AvatarImage src={userImage} alt="" /> : null}
                <AvatarFallback>{userInitial}</AvatarFallback>
              </Avatar>
              <span>{userName}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};
