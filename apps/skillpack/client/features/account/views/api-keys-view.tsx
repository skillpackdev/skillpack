import type { ApiKeySummary } from "@skillpack/contracts/api-keys/responses";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";

import { SidebarTrigger } from "@/components/ui/sidebar";

import { ApiKeysPanel } from "../components/api-keys-panel";

interface ApiKeysViewProps {
  apiKeys: ApiKeySummary[];
}

export const ApiKeysView = ({ apiKeys }: ApiKeysViewProps) => (
  <>
    <header className="h-(--app-shell-header-height) shrink-0 border-b border-border bg-background px-4 md:px-6">
      <div className="flex h-full items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            API keys
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
        <div className="mx-auto w-full max-w-6xl">
          <ApiKeysPanel apiKeys={apiKeys} />
        </div>
      </main>
    </OverlayScrollbarsComponent>
  </>
);
