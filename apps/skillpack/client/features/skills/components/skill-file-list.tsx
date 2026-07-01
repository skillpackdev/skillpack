import { PlusIcon, Trash2Icon, Undo2Icon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

import {
  createResourceDraftSession,
  getFileStatus,
} from "../lib/resource-draft-session";
import type { ResourceDraftSession } from "../lib/resource-draft-session";
import { canDeleteFile } from "../lib/skill-files";
import type { SkillFile } from "../lib/skill-files";

interface SkillFileListProps {
  files: SkillFile[];
  isEditing: boolean;
  selectedPath: string | undefined;
  session?: ResourceDraftSession;
  showHeader?: boolean;
  onAddClick?: () => void;
  onDeletePath?: (path: string) => void;
  onSelectPath: (path: string) => void;
}

const getFileClassName = (isSelected: boolean, isDeleted: boolean) =>
  cn(
    "min-h-14 w-full justify-start rounded-none border-0 px-4 text-left text-sm",
    isDeleted && "bg-destructive/10 text-destructive hover:bg-destructive/15",
    !isDeleted &&
      (isSelected
        ? "bg-muted text-foreground"
        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"),
    isDeleted && isSelected && "bg-destructive/15"
  );

const getStatusBadgeVariant = (status: string) =>
  status === "deleted" ? "destructive" : "secondary";

const SkillFileListHeader = ({
  isEditing,
  onAddClick,
}: {
  isEditing: boolean;
  onAddClick?: () => void;
}) => (
  <div className="flex min-h-14 items-center justify-between border-b border-border px-4 text-sm font-medium text-muted-foreground">
    <span>Files</span>
    {isEditing && onAddClick ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Add file"
        onClick={onAddClick}
      >
        <PlusIcon data-icon="inline-start" />
      </Button>
    ) : null}
  </div>
);

const EmptySkillFileList = () => (
  <Empty className="min-h-48 rounded-none border-0 p-6">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <PlusIcon />
      </EmptyMedia>
      <EmptyTitle>No files yet</EmptyTitle>
      <EmptyDescription>
        No files are available for this Managed Skill version.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const SkillFileListItem = ({
  file,
  isEditing,
  isSelected,
  session,
  onDeletePath,
  onSelectPath,
}: {
  file: SkillFile;
  isEditing: boolean;
  isSelected: boolean;
  session: ResourceDraftSession;
  onDeletePath?: (path: string) => void;
  onSelectPath: (path: string) => void;
}) => {
  const status = getFileStatus(file.path, session);
  const isDeleted = status === "deleted";
  const showDelete = isEditing && canDeleteFile(file) && onDeletePath;
  const showBadge = status !== "clean";

  return (
    <div className="relative border-border border-b last:border-b-0">
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSelectPath(file.path)}
        className={getFileClassName(isSelected, isDeleted)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 pr-8">
          <span className="truncate font-medium" title={file.path}>
            {file.path}
          </span>
          {showBadge ? (
            <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
          ) : null}
        </span>
      </Button>
      {showDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={
            isDeleted ? `Undo delete ${file.path}` : `Delete ${file.path}`
          }
          className="absolute top-1/2 right-2 -translate-y-1/2"
          onClick={() => onDeletePath?.(file.path)}
        >
          {isDeleted ? (
            <Undo2Icon data-icon="inline-start" />
          ) : (
            <Trash2Icon data-icon="inline-start" />
          )}
        </Button>
      ) : null}
    </div>
  );
};

const readonlyResourceSession = createResourceDraftSession();

export const SkillFileList = ({
  files,
  isEditing,
  selectedPath,
  session = readonlyResourceSession,
  showHeader = true,
  onAddClick,
  onDeletePath,
  onSelectPath,
}: SkillFileListProps) => (
  <>
    {showHeader ? (
      <SkillFileListHeader isEditing={isEditing} onAddClick={onAddClick} />
    ) : null}
    {files.length ? (
      files.map((file) => (
        <SkillFileListItem
          key={file.path}
          file={file}
          isEditing={isEditing}
          isSelected={selectedPath === file.path}
          session={session}
          onDeletePath={onDeletePath}
          onSelectPath={onSelectPath}
        />
      ))
    ) : (
      <EmptySkillFileList />
    )}
  </>
);
