import type { ApiKeySummary } from "@skillpack/contracts/api-keys/responses";

import { ApiKeysPanel } from "../components/api-keys-panel";

interface SettingsViewProps {
  apiKeys: ApiKeySummary[];
}

export const SettingsView = ({ apiKeys }: SettingsViewProps) => (
  <main className="flex min-h-svh flex-col gap-6 p-4 md:p-8">
    <div className="flex max-w-3xl flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="text-sm text-muted-foreground">
        Manage credentials for external clients connected to Skillpack.
      </p>
    </div>

    <div className="flex max-w-6xl flex-col gap-6">
      <ApiKeysPanel apiKeys={apiKeys} />
    </div>
  </main>
);
