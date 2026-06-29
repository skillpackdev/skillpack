import type { ApiKeySummary } from "@skillpack/contracts/api-keys/responses";
import { KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useCreateApiKey, useRevokeApiKey } from "../api/use-api-keys";
import {
  dateTimeLocalInputToIso,
  formatApiKeyDate,
  getApiKeyStatus,
  getDefaultApiKeyExpirationInput,
} from "../lib/api-key-format";
import { ApiKeySecretDialog } from "./api-key-secret-dialog";

interface ApiKeysPanelProps {
  apiKeys: ApiKeySummary[];
}

const getStatusBadgeVariant = (status: ReturnType<typeof getApiKeyStatus>) =>
  status === "active" ? "secondary" : "outline";

export const ApiKeysPanel = ({ apiKeys }: ApiKeysPanelProps) => {
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const defaultExpiresAt = useMemo(() => getDefaultApiKeyExpirationInput(), []);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);

  const submitApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await createApiKey.mutateAsync({
      expiresAt: dateTimeLocalInputToIso(expiresAt),
      name,
    });

    setName("");
    setExpiresAt(defaultExpiresAt);
    setCreatedSecret(result.secret);
    setSecretDialogOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            Create keys for clients that need to connect without a browser
            session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submitApiKey(event)}>
            <FieldGroup>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem_auto] md:items-end">
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
                  <FieldDescription>
                    Use a name that identifies where this key will live.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="api-key-expires-at">
                    Expires at
                  </FieldLabel>
                  <Input
                    id="api-key-expires-at"
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    required
                  />
                  <FieldDescription>
                    Keys stop working after this time.
                  </FieldDescription>
                </Field>
                <Button
                  type="submit"
                  disabled={createApiKey.isPending}
                  className="md:mb-7"
                >
                  <PlusIcon data-icon="inline-start" />
                  Create key
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing keys</CardTitle>
          <CardDescription>
            Compare saved keys using their hint. Full keys are not stored.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">{apiKeys.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {apiKeys.length === 0 ? (
            <Alert>
              <KeyRoundIcon />
              <AlertTitle>No API keys</AlertTitle>
              <AlertDescription>
                Create a key when you are ready to connect an external client.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key hint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((apiKey) => {
                  const status = getApiKeyStatus(
                    apiKey.expiresAt,
                    apiKey.revokedAt
                  );
                  const canRevoke = status !== "revoked";

                  return (
                    <TableRow key={apiKey.id}>
                      <TableCell className="font-medium">
                        {apiKey.name}
                      </TableCell>
                      <TableCell>
                        <code className="rounded-md bg-muted px-2 py-1 text-xs">
                          {apiKey.keyHint}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(status)}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {formatApiKeyDate(apiKey.createdAt)}
                      </TableCell>
                      <TableCell>
                        {formatApiKeyDate(apiKey.expiresAt)}
                      </TableCell>
                      <TableCell>
                        {formatApiKeyDate(apiKey.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canRevoke || revokeApiKey.isPending}
                          onClick={() => {
                            void revokeApiKey.mutateAsync(apiKey.id);
                          }}
                        >
                          <Trash2Icon data-icon="inline-start" />
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
    </>
  );
};
