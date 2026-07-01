import type { ResolvedSkill } from "@skillpack/contracts/skills/responses";
import { ChevronDownIcon, Undo2Icon } from "lucide-react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import { Suspense, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { useSkillFile } from "../api/use-skill-detail";
import type { ResourceDraftSession } from "../lib/resource-draft-session";
import { getSkillResourceKind } from "../lib/resource-kind";
import { getDetailFileSwitcherLabel } from "../lib/skill-detail-surface";
import {
  canDeleteFile,
  getRawResourceUrl,
  getTextSize,
  isEditableTextFile,
  skillFileMediaType,
  skillFilePath,
} from "../lib/skill-files";
import type { SkillFile } from "../lib/skill-files";
import { AddResourceDialog } from "./add-resource-dialog";
import { ResourceEditor } from "./resource-editor";
import { SkillFileList } from "./skill-file-list";

interface SkillDetailFilesPanelProps {
  addedPaths: Set<string>;
  deletedPaths: Set<string>;
  descriptionValue: string | undefined;
  draftsByPath: Record<string, string>;
  files: SkillFile[];
  isEditing: boolean;
  selectedFile: SkillFile | undefined;
  session: ResourceDraftSession;
  skill: ResolvedSkill | undefined;
  onAddPath: (path: string) => void;
  onDeletePath: (path: string) => void;
  onDescriptionChange: (description: string) => void;
  onDraftChange: (
    path: string,
    content: string,
    originalContent: string
  ) => void;
  onRenamePath: (path: string, nextPath: string, content: string) => void;
  onSelectPath: (path: string) => void;
}

interface ResourceContentPaneProps {
  canEdit: boolean;
  deletedPaths: Set<string>;
  descriptionValue: string | undefined;
  existingPaths: Set<string>;
  file:
    | {
        content: string;
        mediaType: string;
        path: string;
        size: number;
      }
    | undefined;
  isEditing: boolean;
  rawUrl: string | undefined;
  selectedFile: SkillFile | undefined;
  status: string;
  value: string;
  onChange: (value: string) => void;
  onDeletePath: (path: string) => void;
  onDescriptionChange: (description: string) => void;
  onRenamePath: (path: string, nextPath: string, content: string) => void;
}

interface SelectedResourceViewModelInput {
  addedPaths: Set<string>;
  deletedPaths: Set<string>;
  draftsByPath: Record<string, string>;
  selectedFile: SkillFile | undefined;
  skill: ResolvedSkill | undefined;
}

const getResourceContentStatus = (
  file: { path: string } | undefined,
  isLoading: boolean
) => {
  if (isLoading) {
    return "Loading file...";
  }

  if (file) {
    return `Loaded ${file.path}`;
  }

  return "File unavailable";
};

const getViewerStatus = ({
  file,
  isDeleted,
  isLoading,
  selectedFile,
}: {
  file: { path: string } | undefined;
  isDeleted: boolean;
  isLoading: boolean;
  selectedFile: SkillFile | undefined;
}) => {
  if (!selectedFile) {
    return "Select a file";
  }

  if (isDeleted) {
    return "File marked for deletion";
  }

  return getResourceContentStatus(file, isLoading);
};

const getSelectedResourceKind = (selectedFile: SkillFile | undefined) => {
  if (!selectedFile) {
    return;
  }

  return getSkillResourceKind(selectedFile);
};

const getCanEditFile = (
  selectedFile: SkillFile | undefined,
  deletedPaths: Set<string>
) =>
  Boolean(
    selectedFile &&
    isEditableTextFile(selectedFile) &&
    !deletedPaths.has(selectedFile.path)
  );

const getShouldFetchFile = ({
  addedPaths,
  isSkillFile,
  selectedFile,
}: {
  addedPaths: Set<string>;
  isSkillFile: boolean;
  selectedFile: SkillFile | undefined;
}) =>
  Boolean(
    selectedFile &&
    !isSkillFile &&
    getSelectedResourceKind(selectedFile) !== "image" &&
    !addedPaths.has(selectedFile.path)
  );

const getSelectedSkillFile = (
  skill: ResolvedSkill | undefined,
  selectedFile: SkillFile | undefined
) => {
  if (!(skill && selectedFile?.path === skillFilePath)) {
    return;
  }

  return {
    content: skill.content,
    mediaType: skillFileMediaType,
    path: skillFilePath,
    size: getTextSize(skill.content),
  };
};

const getSelectedAddedFile = (
  addedPaths: Set<string>,
  draftsByPath: Record<string, string>,
  selectedFile: SkillFile | undefined
) => {
  if (!(selectedFile && addedPaths.has(selectedFile.path))) {
    return;
  }

  const content = draftsByPath[selectedFile.path] ?? "";

  return {
    content,
    mediaType: selectedFile.mediaType,
    path: selectedFile.path,
    size: getTextSize(content),
  };
};

const DeletedResourcePanel = ({
  path,
  onDeletePath,
}: {
  path: string;
  onDeletePath: (path: string) => void;
}) => (
  <div className="px-4 py-4 md:px-6">
    <Alert>
      <Undo2Icon />
      <AlertTitle>File marked for deletion</AlertTitle>
      <AlertDescription>
        Undo the deletion to keep this file in the current Managed Skill.
      </AlertDescription>
      <div className="pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onDeletePath(path)}
        >
          <Undo2Icon data-icon="inline-start" />
          Undo delete
        </Button>
      </div>
    </Alert>
  </div>
);

const ResourceContentPane = ({
  canEdit,
  deletedPaths,
  descriptionValue,
  existingPaths,
  file,
  isEditing,
  rawUrl,
  selectedFile,
  status,
  value,
  onChange,
  onDeletePath,
  onDescriptionChange,
  onRenamePath,
}: ResourceContentPaneProps) => {
  if (selectedFile && deletedPaths.has(selectedFile.path)) {
    return (
      <DeletedResourcePanel
        path={selectedFile.path}
        onDeletePath={onDeletePath}
      />
    );
  }

  return (
    <ResourceEditor
      canEdit={canEdit}
      canEditDescription={Boolean(
        canEdit && selectedFile?.path === skillFilePath
      )}
      descriptionValue={descriptionValue}
      existingPaths={existingPaths}
      file={file}
      preferEdit={canEdit}
      rawUrl={rawUrl}
      resource={selectedFile}
      showRename={Boolean(
        isEditing && selectedFile && canDeleteFile(selectedFile) && file
      )}
      status={status}
      value={value}
      onChange={onChange}
      onDescriptionChange={onDescriptionChange}
      onRename={(nextPath) => {
        if (selectedFile) {
          onRenamePath(selectedFile.path, nextPath, value);
        }
      }}
    />
  );
};

const useSelectedResourceViewModel = ({
  addedPaths,
  deletedPaths,
  draftsByPath,
  selectedFile,
  skill,
}: SelectedResourceViewModelInput) => {
  const isSkillFile = selectedFile?.path === skillFilePath;
  const shouldFetchFile = getShouldFetchFile({
    addedPaths,
    isSkillFile,
    selectedFile,
  });
  const resourceFile = useSkillFile(
    skill?.name,
    shouldFetchFile && selectedFile ? selectedFile.path : undefined
  );
  const skillFile = getSelectedSkillFile(skill, selectedFile);
  const addedFile = getSelectedAddedFile(
    addedPaths,
    draftsByPath,
    selectedFile
  );
  const file = addedFile ?? skillFile ?? resourceFile.data;
  const value = selectedFile
    ? (draftsByPath[selectedFile.path] ?? file?.content ?? "")
    : "";
  const rawUrl = getRawResourceUrl(skill?.name, selectedFile?.path);
  const viewerStatus = getViewerStatus({
    file,
    isDeleted: Boolean(selectedFile && deletedPaths.has(selectedFile.path)),
    isLoading: resourceFile.isLoading,
    selectedFile,
  });

  return { file, rawUrl, value, viewerStatus };
};

export const SkillDetailFilesPanel = ({
  addedPaths,
  deletedPaths,
  descriptionValue,
  draftsByPath,
  files,
  isEditing,
  selectedFile,
  session,
  skill,
  onAddPath,
  onDeletePath,
  onDescriptionChange,
  onDraftChange,
  onRenamePath,
  onSelectPath,
}: SkillDetailFilesPanelProps) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [mobileFilesOpen, setMobileFilesOpen] = useState(false);
  const canEdit = isEditing && getCanEditFile(selectedFile, deletedPaths);
  const { file, rawUrl, value, viewerStatus } = useSelectedResourceViewModel({
    addedPaths,
    deletedPaths,
    draftsByPath,
    selectedFile,
    skill,
  });
  const existingPaths = useMemo(
    () => new Set(files.map((fileItem) => fileItem.path)),
    [files]
  );

  const changeDraft = (nextValue: string) => {
    if (!selectedFile) {
      return;
    }

    onDraftChange(selectedFile.path, nextValue, file?.content ?? "");
  };

  const selectPath = (path: string) => {
    onSelectPath(path);
    setMobileFilesOpen(false);
  };

  return (
    <section className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[minmax(10rem,16rem)_1fr]">
      <div className="border-b border-border px-4 py-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          onClick={() => setMobileFilesOpen(true)}
        >
          <span className="truncate">
            {getDetailFileSwitcherLabel(selectedFile?.path)}
          </span>
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </div>
      <div className="hidden min-h-0 border-r border-border md:block">
        <OverlayScrollbarsComponent
          defer
          options={{
            scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
          }}
          className="h-full min-h-0"
        >
          <SkillFileList
            files={files}
            isEditing={isEditing}
            selectedPath={selectedFile?.path}
            session={session}
            onAddClick={() => setAddDialogOpen(true)}
            onDeletePath={onDeletePath}
            onSelectPath={onSelectPath}
          />
        </OverlayScrollbarsComponent>
      </div>
      <div className="min-h-0 flex-1 md:h-full md:min-w-0">
        <Suspense
          fallback={
            <div className="grid gap-3 px-4 py-4 md:px-6">
              <Skeleton className="h-5 w-40 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-11/12 rounded-md" />
              <Skeleton className="h-4 w-2/3 rounded-md" />
            </div>
          }
        >
          <ResourceContentPane
            canEdit={canEdit}
            deletedPaths={deletedPaths}
            descriptionValue={descriptionValue}
            existingPaths={existingPaths}
            file={file}
            isEditing={isEditing}
            rawUrl={rawUrl}
            selectedFile={selectedFile}
            status={viewerStatus}
            value={value}
            onChange={changeDraft}
            onDeletePath={onDeletePath}
            onDescriptionChange={onDescriptionChange}
            onRenamePath={onRenamePath}
          />
        </Suspense>
      </div>
      <Sheet open={mobileFilesOpen} onOpenChange={setMobileFilesOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh]"
          showCloseButton={false}
        >
          <SheetHeader>
            <SheetTitle>Files</SheetTitle>
          </SheetHeader>
          <OverlayScrollbarsComponent
            defer
            options={{
              scrollbars: { autoHide: "leave", theme: "os-theme-dark" },
            }}
            className="min-h-0 flex-1 border-t border-border"
          >
            <SkillFileList
              files={files}
              isEditing={isEditing}
              selectedPath={selectedFile?.path}
              session={session}
              showHeader={false}
              onAddClick={() => {
                setMobileFilesOpen(false);
                setAddDialogOpen(true);
              }}
              onDeletePath={onDeletePath}
              onSelectPath={selectPath}
            />
          </OverlayScrollbarsComponent>
        </SheetContent>
      </Sheet>
      <AddResourceDialog
        existingPaths={existingPaths}
        open={addDialogOpen}
        onAdd={onAddPath}
        onOpenChange={setAddDialogOpen}
      />
    </section>
  );
};
