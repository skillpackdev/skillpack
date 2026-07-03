import type {
  ResolvedSkill,
  SkillVersionListItem,
} from "@skillpack/contracts/skills/responses";
import { formatDistanceToNow } from "date-fns";
import {
  MoreVerticalIcon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/shared/api/client";

import {
  useSkillVersion,
  useSkillVersionFile,
  useSkillVersionHistory,
} from "../api/use-skill-detail";
import {
  useDeleteSkillVersionLabel,
  useRestoreSkillVersion,
  useUpsertSkillVersionLabel,
} from "../api/use-skill-mutations";
import {
  getLoadedResourceStatus,
  getSelectedSkillMarkdownFile,
  resourceLoadingFileStatus,
  resourceSelectFileStatus,
} from "../lib/resource-file-selection";
import type { ResourceFileContent } from "../lib/resource-file-selection";
import { getSkillResourceKind } from "../lib/resource-kind";
import {
  getRawSkillVersionResourceUrl,
  getSkillFiles,
  skillFilePath,
} from "../lib/skill-files";
import type { SkillFile } from "../lib/skill-files";
import { ResourceViewer } from "./resource-viewer";
import { SkillFileList } from "./skill-file-list";

interface SkillVersionHistoryDialogProps {
  open: boolean;
  skillName: string | undefined;
  onOpenChange: (open: boolean) => void;
}

interface VersionListItemProps {
  current: boolean;
  pending: boolean;
  selected: boolean;
  version: SkillVersionListItem;
  onEditLabel: (version: SkillVersionListItem) => void;
  onRemoveLabel: (version: SkillVersionListItem) => void;
  onSelect: (versionId: string) => void;
}

interface SkillVersionLabelDialogProps {
  open: boolean;
  pending: boolean;
  version: SkillVersionListItem | undefined;
  onOpenChange: (open: boolean) => void;
  onSubmit: (versionId: string, label: string) => Promise<void>;
}

interface VersionResourceExplorerProps {
  open: boolean;
  selectedPath: string | undefined;
  skillName: string | undefined;
  version: ResolvedSkill | undefined;
  versionId: string | undefined;
  versionPending: boolean;
  onSelectPath: (path: string) => void;
}

const labelMaxLength = 160;

const formatVersionCreatedAt = (createdAt: string) =>
  formatDistanceToNow(new Date(createdAt), { addSuffix: true });

const getVersionTitle = (version: SkillVersionListItem | undefined) =>
  version?.label ?? "Unnamed version";

const getVersionResourceFile = ({
  resourceFile,
  selectedFile,
  version,
}: {
  resourceFile: ResourceFileContent | undefined;
  selectedFile: SkillFile | undefined;
  version: ResolvedSkill | undefined;
}): ResourceFileContent | undefined => {
  if (!(selectedFile && version)) {
    return;
  }

  return getSelectedSkillMarkdownFile(version, selectedFile) ?? resourceFile;
};

const getVersionResourceStatus = ({
  resourceFilePending,
  selectedFile,
  versionPending,
}: {
  resourceFilePending: boolean;
  selectedFile: SkillFile | undefined;
  versionPending: boolean;
}) => {
  if (versionPending) {
    return "Loading version...";
  }

  if (resourceFilePending) {
    return resourceLoadingFileStatus;
  }

  if (selectedFile) {
    return getLoadedResourceStatus(selectedFile.path);
  }

  return resourceSelectFileStatus;
};

const VersionHistoryEmptyState = ({ status }: { status: string }) => (
  <Empty className="min-h-48 rounded-none border-0 p-6">
    <EmptyHeader>
      <EmptyTitle>{status}</EmptyTitle>
      <EmptyDescription>
        Saved Skill Versions will appear here after edits.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const VersionResourcesLoading = () => (
  <div className="flex min-h-0 flex-col">
    <div className="flex min-h-14 items-center border-b border-border px-4 text-sm font-medium text-muted-foreground">
      Files
    </div>
    <div className="grid gap-3 p-4">
      <Skeleton className="h-9 w-full rounded-2xl" />
      <Skeleton className="h-9 w-10/12 rounded-2xl" />
      <Skeleton className="h-9 w-11/12 rounded-2xl" />
    </div>
  </div>
);

const VersionListItem = ({
  current,
  pending,
  selected,
  version,
  onEditLabel,
  onRemoveLabel,
  onSelect,
}: VersionListItemProps) => {
  const createdAtLabel = formatVersionCreatedAt(version.createdAt);
  const title = version.label ?? createdAtLabel;
  const removeDisabled = pending || !version.label;

  return (
    <Item
      render={<li />}
      size="sm"
      variant={selected ? "outline" : "default"}
      className={cn(
        "mx-3 flex-nowrap rounded-3xl",
        selected ? "bg-background shadow-sm" : "hover:bg-background/70"
      )}
    >
      <ItemContent className="min-w-0">
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => onSelect(version.id)}
        >
          <ItemTitle className="max-w-full">
            <span className="truncate">{title}</span>
            {current ? <Badge variant="secondary">Current</Badge> : null}
          </ItemTitle>
          {version.label ? (
            <ItemDescription>
              <time dateTime={version.createdAt}>{createdAtLabel}</time>
            </ItemDescription>
          ) : null}
        </button>
      </ItemContent>
      <ItemActions className="self-start">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Actions for ${title}`}
              />
            }
          >
            <MoreVerticalIcon data-icon="inline-start" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="!w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onEditLabel(version)}>
                <PencilIcon data-icon="inline-start" />
                Edit Skill Version Label
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={removeDisabled}
                variant="destructive"
                onClick={() => onRemoveLabel(version)}
              >
                <Trash2Icon data-icon="inline-start" />
                Remove Skill Version Label
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
};

const SkillVersionLabelDialog = ({
  open,
  pending,
  version,
  onOpenChange,
  onSubmit,
}: SkillVersionLabelDialogProps) => {
  const [errorMessage, setErrorMessage] = useState<string>();
  const [label, setLabel] = useState("");

  useEffect(() => {
    setErrorMessage(undefined);
    setLabel(version?.label ?? "");
  }, [version]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextLabel = label.trim();

    if (!version) {
      return;
    }

    if (!nextLabel) {
      setErrorMessage("Skill Version Label is required");
      return;
    }

    setErrorMessage(undefined);

    try {
      await onSubmit(version.id, nextLabel);
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(await getApiErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Skill Version Label</DialogTitle>
          <DialogDescription>
            Give this Skill Version a label that is easy to find later.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <FieldGroup>
            <Field>
              <Input
                id="rename-version-label"
                aria-label="Skill Version Label"
                maxLength={labelMaxLength}
                placeholder="Known good"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </Field>
            <FieldError>{errorMessage}</FieldError>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const VersionResourceExplorer = ({
  open,
  selectedPath,
  skillName,
  version,
  versionId,
  versionPending,
  onSelectPath,
}: VersionResourceExplorerProps) => {
  const files = useMemo(() => getSkillFiles(version), [version]);
  const selectedFile = files.find((file) => file.path === selectedPath);
  const selectedResourceKind = selectedFile
    ? getSkillResourceKind(selectedFile)
    : undefined;
  const shouldFetchResource = Boolean(
    open &&
    selectedFile &&
    selectedFile.path !== skillFilePath &&
    selectedResourceKind !== "image"
  );
  const resourceFile = useSkillVersionFile(
    skillName,
    versionId,
    selectedFile?.path,
    shouldFetchResource
  );
  const file = getVersionResourceFile({
    resourceFile: resourceFile.data,
    selectedFile,
    version,
  });
  const rawUrl = getRawSkillVersionResourceUrl(
    skillName,
    versionId,
    selectedFile?.path
  );
  const status = getVersionResourceStatus({
    resourceFilePending: resourceFile.isPending && shouldFetchResource,
    selectedFile,
    versionPending,
  });

  return (
    <section className="grid min-h-0 bg-background md:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
      <div className="hidden min-h-0 border-r border-border md:block">
        <OverlayScrollbarsComponent
          defer
          options={{
            scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
          }}
          className="h-full min-h-0"
        >
          {versionPending ? (
            <VersionResourcesLoading />
          ) : (
            <SkillFileList
              files={files}
              isEditing={false}
              selectedPath={selectedFile?.path}
              onSelectPath={onSelectPath}
            />
          )}
        </OverlayScrollbarsComponent>
      </div>
      <div className="min-h-0 min-w-0">
        <ResourceViewer
          file={file}
          rawUrl={rawUrl}
          resource={selectedFile}
          status={status}
        />
      </div>
    </section>
  );
};

export const SkillVersionHistoryDialog = ({
  open,
  skillName,
  onOpenChange,
}: SkillVersionHistoryDialogProps) => {
  const [actionErrorMessage, setActionErrorMessage] = useState<string>();
  const [autoSelectedCurrentVersionId, setAutoSelectedCurrentVersionId] =
    useState<string>();
  const [labelVersion, setLabelVersion] = useState<SkillVersionListItem>();
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string>();
  const [restoreVersionId, setRestoreVersionId] = useState<string>();
  const [selectedPath, setSelectedPath] = useState<string>(skillFilePath);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const history = useSkillVersionHistory(skillName, open);
  const versions = useMemo(
    () => history.data?.versions ?? [],
    [history.data?.versions]
  );
  const selectedVersion = versions.find(
    (version) => version.id === selectedVersionId
  );
  const currentVersionId = versions[0]?.id;
  const selectedVersionIsCurrent = selectedVersion?.id === currentVersionId;
  const versionDetail = useSkillVersion(skillName, selectedVersionId, open);
  const upsertLabel = useUpsertSkillVersionLabel(skillName);
  const deleteLabel = useDeleteSkillVersionLabel(skillName);
  const restoreVersion = useRestoreSkillVersion(skillName);
  const mutationPending =
    upsertLabel.isPending || deleteLabel.isPending || restoreVersion.isPending;

  useEffect(() => {
    if (!open) {
      setActionErrorMessage(undefined);
      setAutoSelectedCurrentVersionId(undefined);
      setLabelVersion(undefined);
      setRestoreErrorMessage(undefined);
      setRestoreVersionId(undefined);
      setSelectedPath(skillFilePath);
      setSelectedVersionId(undefined);
      return;
    }

    if (currentVersionId && autoSelectedCurrentVersionId !== currentVersionId) {
      setActionErrorMessage(undefined);
      setAutoSelectedCurrentVersionId(currentVersionId);
      setSelectedPath(skillFilePath);
      setSelectedVersionId(currentVersionId);
    }
  }, [autoSelectedCurrentVersionId, currentVersionId, open]);

  useEffect(() => {
    setSelectedPath(skillFilePath);
  }, [selectedVersionId]);

  const historyStatus = history.isPending
    ? "Loading version history..."
    : "No versions are available.";

  const renameSelectedVersion = async (versionId: string, label: string) => {
    setActionErrorMessage(undefined);
    await upsertLabel.mutateAsync({ label, versionId });
  };

  const removeVersionLabel = async (version: SkillVersionListItem) => {
    if (!version.label) {
      return;
    }

    setActionErrorMessage(undefined);

    try {
      await deleteLabel.mutateAsync(version.id);
    } catch (error) {
      setActionErrorMessage(await getApiErrorMessage(error));
    }
  };

  const restoreSelectedVersion = async () => {
    if (!restoreVersionId) {
      return;
    }

    setRestoreErrorMessage(undefined);

    try {
      await restoreVersion.mutateAsync(restoreVersionId);
      setRestoreVersionId(undefined);
    } catch (error) {
      setRestoreErrorMessage(await getApiErrorMessage(error));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="!top-0 !left-0 !flex h-dvh w-dvw !max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none p-0 sm:!max-w-none"
        >
          <DialogTitle className="sr-only">Skill Version History</DialogTitle>
          <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close version history"
              onClick={() => onOpenChange(false)}
            >
              <XIcon data-icon="inline-start" />
            </Button>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">
                {getVersionTitle(selectedVersion)}
              </p>
              {selectedVersion ? (
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={selectedVersion.createdAt}
                >
                  {formatVersionCreatedAt(selectedVersion.createdAt)}
                </time>
              ) : null}
            </div>
            <div className="ml-auto">
              {selectedVersion ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutationPending || selectedVersionIsCurrent}
                  title={
                    selectedVersionIsCurrent
                      ? "This is the current version"
                      : "Restore this version"
                  }
                  onClick={() => setRestoreVersionId(selectedVersion.id)}
                >
                  <RotateCcwIcon data-icon="inline-start" />
                  {selectedVersionIsCurrent ? "Current version" : "Restore"}
                </Button>
              ) : null}
            </div>
          </header>
          <div className="grid min-h-0 flex-1 bg-muted/30 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <VersionResourceExplorer
              open={open}
              selectedPath={selectedPath}
              skillName={skillName}
              version={versionDetail.data}
              versionId={selectedVersionId}
              versionPending={versionDetail.isPending}
              onSelectPath={setSelectedPath}
            />
            <aside className="flex min-h-0 flex-col border-border border-t bg-muted/30 lg:border-t-0 lg:border-l">
              <div className="flex min-h-16 shrink-0 items-center justify-between border-b border-border px-5">
                <h2 className="font-medium">Skill Version History</h2>
              </div>
              {actionErrorMessage ? (
                <p className="border-b border-border px-5 py-3 text-sm text-destructive">
                  {actionErrorMessage}
                </p>
              ) : null}
              <OverlayScrollbarsComponent
                defer
                options={{
                  scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
                }}
                className="min-h-0 flex-1 py-3"
              >
                {versions.length ? (
                  <ItemGroup className="gap-1">
                    {versions.map((version) => (
                      <VersionListItem
                        key={version.id}
                        current={version.id === currentVersionId}
                        pending={mutationPending}
                        selected={version.id === selectedVersionId}
                        version={version}
                        onEditLabel={setLabelVersion}
                        onRemoveLabel={(nextVersion) => {
                          void removeVersionLabel(nextVersion);
                        }}
                        onSelect={setSelectedVersionId}
                      />
                    ))}
                  </ItemGroup>
                ) : (
                  <VersionHistoryEmptyState status={historyStatus} />
                )}
              </OverlayScrollbarsComponent>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
      <SkillVersionLabelDialog
        open={Boolean(labelVersion)}
        pending={upsertLabel.isPending}
        version={labelVersion}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setLabelVersion(undefined);
          }
        }}
        onSubmit={renameSelectedVersion}
      />
      <AlertDialog
        open={Boolean(restoreVersionId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setRestoreErrorMessage(undefined);
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
            {restoreErrorMessage ? (
              <p className="text-sm text-destructive">{restoreErrorMessage}</p>
            ) : null}
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
