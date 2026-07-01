import type { SkillVersionListItem } from "@skillpack/contracts/skills/responses";
import { formatDistanceToNow } from "date-fns";
import { PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

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
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { getApiErrorMessage } from "@/shared/api/client";

import {
  useSkillVersion,
  useSkillVersionHistory,
} from "../api/use-skill-detail";
import {
  useDeleteSkillVersionLabel,
  useRestoreSkillVersion,
  useUpsertSkillVersionLabel,
} from "../api/use-skill-mutations";

interface SkillVersionHistorySheetProps {
  open: boolean;
  skillName: string | undefined;
  onOpenChange: (open: boolean) => void;
}

const labelMaxLength = 160;

const formatVersionCreatedAt = (createdAt: string) =>
  formatDistanceToNow(new Date(createdAt), { addSuffix: true });

interface VersionListItemProps {
  selected: boolean;
  version: SkillVersionListItem;
  onSelect: (versionId: string) => void;
}

const VersionListItem = ({
  selected,
  version,
  onSelect,
}: VersionListItemProps) => {
  const createdAtLabel = formatVersionCreatedAt(version.createdAt);

  return (
    <button
      type="button"
      className={`grid w-full gap-1 border-b border-border px-6 py-3 text-left text-sm hover:bg-muted/40 ${
        selected ? "bg-muted" : ""
      }`}
      onClick={() => onSelect(version.id)}
    >
      {version.label ? (
        <>
          <span className="truncate font-medium">{version.label}</span>
          <time
            className="text-xs text-muted-foreground"
            dateTime={version.createdAt}
          >
            {createdAtLabel}
          </time>
        </>
      ) : (
        <time className="truncate font-medium" dateTime={version.createdAt}>
          {createdAtLabel}
        </time>
      )}
    </button>
  );
};

interface LabelFormProps {
  initialLabel: string;
  pending: boolean;
  onDelete: () => Promise<void>;
  onSubmit: (label: string) => Promise<void>;
}

const LabelForm = ({
  initialLabel,
  pending,
  onDelete,
  onSubmit,
}: LabelFormProps) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [label, setLabel] = useState(initialLabel);

  useEffect(() => {
    setLabel(initialLabel);
    setErrorMessage(undefined);
  }, [initialLabel]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(undefined);

    try {
      await onSubmit(label);
    } catch (error) {
      setErrorMessage(await getApiErrorMessage(error));
    }
  };

  const deleteLabel = async () => {
    setErrorMessage(undefined);

    try {
      await onDelete();
    } catch (error) {
      setErrorMessage(await getApiErrorMessage(error));
    }
  };

  return (
    <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
      <FieldGroup className="gap-2">
        <Field>
          <FieldLabel htmlFor="version-label">Version label</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="version-label"
              maxLength={labelMaxLength}
              placeholder="Known good"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PencilIcon data-icon="inline-start" />
              )}
              Save
            </Button>
          </div>
        </Field>
        <FieldError>{errorMessage}</FieldError>
      </FieldGroup>
      {initialLabel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          disabled={pending}
          onClick={() => {
            void deleteLabel();
          }}
        >
          <Trash2Icon data-icon="inline-start" />
          Delete label
        </Button>
      ) : null}
    </form>
  );
};

export const SkillVersionHistorySheet = ({
  open,
  skillName,
  onOpenChange,
}: SkillVersionHistorySheetProps) => {
  const [restoreVersionId, setRestoreVersionId] = useState<string>();
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const history = useSkillVersionHistory(skillName, open);
  const versions = useMemo(
    () => history.data?.versions ?? [],
    [history.data?.versions]
  );
  const selectedVersion = versions.find(
    (version) => version.id === selectedVersionId
  );
  const versionDetail = useSkillVersion(skillName, selectedVersionId, open);
  const upsertLabel = useUpsertSkillVersionLabel(skillName);
  const deleteLabel = useDeleteSkillVersionLabel(skillName);
  const restoreVersion = useRestoreSkillVersion(skillName);
  const mutationPending =
    upsertLabel.isPending || deleteLabel.isPending || restoreVersion.isPending;

  useEffect(() => {
    if (!open) {
      setSelectedVersionId(undefined);
      return;
    }

    if (!selectedVersionId && versions[0]) {
      setSelectedVersionId(versions[0].id);
    }
  }, [open, selectedVersionId, versions]);

  const historyStatus = history.isPending
    ? "Loading version history..."
    : "No versions are available.";

  const restoreSelectedVersion = async () => {
    if (!restoreVersionId) {
      return;
    }

    await restoreVersion.mutateAsync(restoreVersionId);
    setRestoreVersionId(undefined);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-4xl">
          <SheetHeader className="pr-16">
            <SheetTitle>Version history</SheetTitle>
          </SheetHeader>
          <div className="grid min-h-0 flex-1 border-t border-border md:grid-cols-[18rem_1fr]">
            <OverlayScrollbarsComponent
              defer
              options={{
                scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
              }}
              className="min-h-0 border-border md:border-r"
            >
              {versions.length ? (
                versions.map((version) => (
                  <VersionListItem
                    key={version.id}
                    selected={version.id === selectedVersionId}
                    version={version}
                    onSelect={setSelectedVersionId}
                  />
                ))
              ) : (
                <Empty className="border-0 px-6 py-12">
                  <EmptyHeader>
                    <EmptyTitle>{historyStatus}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </OverlayScrollbarsComponent>
            <div className="min-h-0 p-6">
              {selectedVersion ? (
                <div className="flex h-full min-h-0 flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="grid gap-1">
                      <h2 className="font-medium">
                        {selectedVersion.label ?? "Unnamed version"}
                      </h2>
                      <time
                        className="text-sm text-muted-foreground"
                        dateTime={selectedVersion.createdAt}
                      >
                        {formatVersionCreatedAt(selectedVersion.createdAt)}
                      </time>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutationPending}
                      onClick={() => setRestoreVersionId(selectedVersion.id)}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      Restore
                    </Button>
                  </div>
                  <LabelForm
                    initialLabel={selectedVersion.label ?? ""}
                    pending={mutationPending}
                    onDelete={() => deleteLabel.mutateAsync(selectedVersion.id)}
                    onSubmit={async (label) => {
                      await upsertLabel.mutateAsync({
                        label,
                        versionId: selectedVersion.id,
                      });
                    }}
                  />
                  <OverlayScrollbarsComponent
                    defer
                    options={{
                      scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
                    }}
                    className="min-h-0 flex-1 rounded-2xl border border-border bg-muted/30"
                  >
                    <pre className="whitespace-pre-wrap p-4 text-sm leading-6">
                      {versionDetail.isPending
                        ? "Loading version..."
                        : (versionDetail.data?.content ?? "")}
                    </pre>
                  </OverlayScrollbarsComponent>
                </div>
              ) : (
                <Empty className="border-0 px-6 py-12">
                  <EmptyHeader>
                    <EmptyTitle>{historyStatus}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={Boolean(restoreVersionId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRestoreVersionId(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version?</AlertDialogTitle>
            <AlertDialogDescription>
              Restore creates a new current version from the selected historical
              version. The current version remains in Version History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoreVersion.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreVersion.isPending || !restoreVersionId}
              onClick={() => {
                void restoreSelectedVersion();
              }}
            >
              {restoreVersion.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
