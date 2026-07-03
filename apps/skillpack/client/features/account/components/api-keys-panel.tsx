import type { ApiKeySummary } from "@skillpack/contracts/api-keys/responses";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/shared/api/client";

import { useCreateApiKey, useRevokeApiKey } from "../api/use-api-keys";
import {
  dateInputToIso,
  formatApiKeyDate,
  formatApiKeyExpirationDate,
  getDefaultApiKeyExpirationInput,
  getMaxApiKeyExpirationInput,
  getMinApiKeyExpirationInput,
} from "../lib/api-key-format";
import { ApiKeySecretDialog } from "./api-key-secret-dialog";

interface ApiKeysPanelProps {
  apiKeys: ApiKeySummary[];
}

export const ApiKeysPanel = ({ apiKeys }: ApiKeysPanelProps) => {
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const defaultExpiresAt = useMemo(() => getDefaultApiKeyExpirationInput(), []);
  const maxExpiresAt = useMemo(() => getMaxApiKeyExpirationInput(), []);
  const minExpiresAt = useMemo(() => getMinApiKeyExpirationInput(), []);
  const visibleApiKeys = apiKeys.filter((apiKey) => !apiKey.revokedAt);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [apiKeyToRevoke, setApiKeyToRevoke] = useState<ApiKeySummary | null>(
    null
  );

  const resetCreateForm = () => {
    setName("");
    setExpiresAt(defaultExpiresAt);
  };

  const submitApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const result = await createApiKey.mutateAsync({
        expiresAt: dateInputToIso(expiresAt),
        name,
      });

      resetCreateForm();
      setCreateFormOpen(false);
      setCreatedSecret(result.secret);
      setSecretDialogOpen(true);
    } catch (error) {
      toast.error(await getApiErrorMessage(error));
    }
  };

  const confirmRevokeApiKey = async () => {
    if (!apiKeyToRevoke) {
      return;
    }

    try {
      await revokeApiKey.mutateAsync(apiKeyToRevoke.id);
      setApiKeyToRevoke(null);
    } catch (error) {
      toast.error(await getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">Keys</h2>
        <Button
          type="button"
          onClick={() => setCreateFormOpen(true)}
          disabled={createFormOpen}
        >
          <PlusIcon data-icon="inline-start" />
          Create key
        </Button>
      </div>

      {createFormOpen ? (
        <Card className="shadow-none" size="sm">
          <CardContent>
            <form onSubmit={(event) => void submitApiKey(event)}>
              <FieldGroup>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem_auto_auto] md:items-end">
                  <Field>
                    <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                    <Input
                      id="api-key-name"
                      value={name}
                      maxLength={120}
                      placeholder="Claude Desktop"
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="api-key-expires-at">
                      Expires
                    </FieldLabel>
                    <Input
                      id="api-key-expires-at"
                      type="date"
                      value={expiresAt}
                      min={minExpiresAt}
                      max={maxExpiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      required
                    />
                  </Field>
                  <Button type="submit" disabled={createApiKey.isPending}>
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={createApiKey.isPending}
                    onClick={() => {
                      resetCreateForm();
                      setCreateFormOpen(false);
                    }}
                  >
                    <XIcon data-icon="inline-start" />
                    Cancel
                  </Button>
                </div>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleApiKeys.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No API keys
                </TableCell>
              </TableRow>
            ) : (
              visibleApiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell className="font-medium">{apiKey.name}</TableCell>
                  <TableCell>
                    <code className="rounded-md bg-muted px-2 py-1 text-xs">
                      {apiKey.keyHint}
                    </code>
                  </TableCell>
                  <TableCell>
                    {formatApiKeyExpirationDate(apiKey.createdAt)}
                  </TableCell>
                  <TableCell>
                    {formatApiKeyExpirationDate(apiKey.expiresAt)}
                  </TableCell>
                  <TableCell>{formatApiKeyDate(apiKey.lastUsedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revokeApiKey.isPending}
                      onClick={() => setApiKeyToRevoke(apiKey)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(apiKeyToRevoke)}
        onOpenChange={(open) => {
          if (!open) {
            setApiKeyToRevoke(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke key?</AlertDialogTitle>
            <AlertDialogDescription>
              {apiKeyToRevoke?.name ?? "This key"} will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeApiKey.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revokeApiKey.isPending}
              onClick={() => {
                void confirmRevokeApiKey();
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ApiKeySecretDialog
        open={secretDialogOpen}
        secret={createdSecret}
        onOpenChange={(open) => {
          setSecretDialogOpen(open);

          if (!open) {
            setCreatedSecret(null);
          }
        }}
      />
    </div>
  );
};
