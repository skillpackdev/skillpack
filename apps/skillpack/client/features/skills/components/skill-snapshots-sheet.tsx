import type { CreateSkillSnapshotInput } from "@skillpack/contracts/skills/requests";
import type {
  ResolvedSkill,
  SkillSnapshotItem,
} from "@skillpack/contracts/skills/responses";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, RotateCcwIcon } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/shared/api/client";

interface SkillSnapshotsSheetProps {
  canTakeSnapshot: boolean;
  open: boolean;
  skill: ResolvedSkill | undefined;
  snapshots: SkillSnapshotItem[];
  snapshotsStatus: string;
  onOpenChange: (open: boolean) => void;
  onRestoreSnapshot: (snapshotNumber: number) => Promise<void>;
  onTakeSnapshot: (input: CreateSkillSnapshotInput) => Promise<void>;
}

const snapshotLabelMaxLength = 80;
const snapshotNoteMaxLength = 500;

const formatSnapshotCreatedAt = (createdAt: string) =>
  formatDistanceToNow(new Date(createdAt), { addSuffix: true });

const getOptionalSnapshotText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

interface SnapshotComposerProps {
  onCancel: () => void;
  onCreated: () => void;
  onTakeSnapshot: (input: CreateSkillSnapshotInput) => Promise<void>;
}

const SnapshotComposer = ({
  onCancel,
  onCreated,
  onTakeSnapshot,
}: SnapshotComposerProps) => {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(undefined);
    setIsTakingSnapshot(true);

    try {
      await onTakeSnapshot({
        label: getOptionalSnapshotText(label),
        note: getOptionalSnapshotText(note),
      });
      setLabel("");
      setNote("");
      onCreated();
    } catch (error) {
      setErrorMessage(await getApiErrorMessage(error));
    } finally {
      setIsTakingSnapshot(false);
    }
  };

  return (
    <form
      className="mx-6 mb-4 flex flex-col gap-4 rounded-3xl border border-border bg-muted/30 p-4"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="snapshot-label">Label</FieldLabel>
          <Input
            id="snapshot-label"
            maxLength={snapshotLabelMaxLength}
            placeholder="Before editing resources"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="snapshot-note">Note</FieldLabel>
          <Textarea
            id="snapshot-note"
            maxLength={snapshotNoteMaxLength}
            placeholder="What should future you remember about this checkpoint?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FieldError>{errorMessage}</FieldError>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isTakingSnapshot}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isTakingSnapshot}>
          {isTakingSnapshot ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlusIcon data-icon="inline-start" />
          )}
          Take snapshot
        </Button>
      </div>
    </form>
  );
};

interface SnapshotListItemProps {
  canRestoreSnapshot: boolean;
  snapshot: SkillSnapshotItem;
  onRestoreSnapshot: (snapshotNumber: number) => Promise<void>;
}

const SnapshotListItem = ({
  canRestoreSnapshot,
  snapshot,
  onRestoreSnapshot,
}: SnapshotListItemProps) => {
  const createdAtLabel = formatSnapshotCreatedAt(snapshot.createdAt);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-3 text-sm hover:bg-muted/40">
      <div className="grid min-w-0 flex-1 gap-1">
        {snapshot.label ? (
          <>
            <span className="truncate font-medium">{snapshot.label}</span>
            <time
              className="text-xs text-muted-foreground"
              dateTime={snapshot.createdAt}
            >
              {createdAtLabel}
            </time>
          </>
        ) : (
          <time className="truncate font-medium" dateTime={snapshot.createdAt}>
            {createdAtLabel}
          </time>
        )}
        {snapshot.note ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {snapshot.note}
          </p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canRestoreSnapshot}
        onClick={() => {
          void onRestoreSnapshot(snapshot.snapshotNumber);
        }}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Restore
      </Button>
    </div>
  );
};

export const SkillSnapshotsSheet = ({
  canTakeSnapshot,
  open,
  skill,
  snapshots,
  snapshotsStatus,
  onOpenChange,
  onRestoreSnapshot,
  onTakeSnapshot,
}: SkillSnapshotsSheetProps) => {
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (!open || !canTakeSnapshot) {
      setComposerOpen(false);
    }
  }, [canTakeSnapshot, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader className="pr-16">
          <SheetTitle>Snapshots</SheetTitle>
        </SheetHeader>
        {canTakeSnapshot && !composerOpen ? (
          <div className="px-6 pb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setComposerOpen(true)}
            >
              <PlusIcon data-icon="inline-start" />
              Take snapshot
            </Button>
          </div>
        ) : null}
        {canTakeSnapshot && composerOpen ? (
          <SnapshotComposer
            onCancel={() => setComposerOpen(false)}
            onCreated={() => setComposerOpen(false)}
            onTakeSnapshot={onTakeSnapshot}
          />
        ) : null}
        <OverlayScrollbarsComponent
          defer
          options={{
            scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
          }}
          className="min-h-0 flex-1"
        >
          {snapshots.length ? (
            snapshots.map((snapshot) => (
              <SnapshotListItem
                key={snapshot.snapshotNumber}
                canRestoreSnapshot={Boolean(skill)}
                snapshot={snapshot}
                onRestoreSnapshot={onRestoreSnapshot}
              />
            ))
          ) : (
            <Empty className="border-0 px-6 py-12">
              <EmptyHeader>
                <EmptyTitle>{snapshotsStatus}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </OverlayScrollbarsComponent>
      </SheetContent>
    </Sheet>
  );
};
