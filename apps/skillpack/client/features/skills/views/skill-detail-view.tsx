import type { PatchSkillInput } from "@skillpack/contracts/skills/requests";
import type { ResolvedSkill } from "@skillpack/contracts/skills/responses";
import { skillNameSchema } from "@skillpack/core/primitives";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, HistoryIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { useSkillList } from "../api/use-skill-list";
import { SkillDetailFilesPanel } from "../components/skill-detail-files-panel";
import { SkillVersionHistoryDialog } from "../components/skill-version-history-dialog";
import { getChangeCount } from "../lib/resource-draft-session";
import {
  buildResourcePatchInput,
  getTextResourceMediaType,
} from "../lib/resource-drafts";
import { getSkillFiles, getTextSize, skillFilePath } from "../lib/skill-files";
import {
  getSkillResourceEditSession,
  useSkillResourceEditStore,
} from "../store/skill-resource-edit-store";

interface SkillDetailViewProps {
  skill: ResolvedSkill | undefined;
  selectedPath: string | undefined;
  onPathChange: (path: string | undefined) => void;
  onSaveChanges: (input: PatchSkillInput) => Promise<void>;
}

const getSaveStatusLabel = (
  saveStatus: string,
  isSaving: boolean,
  changeCount: number
) => {
  if (isSaving || saveStatus !== "Unsaved changes") {
    return saveStatus;
  }

  const noun = changeCount === 1 ? "change" : "changes";
  return `${changeCount} unsaved ${noun}`;
};

const getSkillNameError = (
  skillName: string,
  existingSkillNames: Set<string>
) => {
  const validation = skillNameSchema.safeParse(skillName);

  if (!validation.success) {
    return validation.error.issues.at(0)?.message ?? "Invalid Skill Name";
  }

  if (existingSkillNames.has(skillName)) {
    return "Skill name already exists";
  }

  return null;
};

interface SkillTitleProps {
  isEditing: boolean;
  skillName: string | undefined;
  skillNameError: string | null;
  skillNameValue: string;
  onSkillNameChange: (skillName: string) => void;
}

const SkillTitle = ({
  isEditing,
  skillName,
  skillNameError,
  skillNameValue,
  onSkillNameChange,
}: SkillTitleProps) => {
  if (isEditing) {
    return (
      <Input
        aria-label="Skill Name"
        aria-invalid={Boolean(skillNameError)}
        className="h-9 w-full text-lg font-semibold tracking-tight md:max-w-80"
        id="skill-name"
        name="skillName"
        title={skillNameError ?? "Skill Name"}
        value={skillNameValue}
        onChange={(event) => onSkillNameChange(event.target.value)}
      />
    );
  }

  return (
    <h1 className="truncate text-lg font-semibold tracking-tight">
      {skillName ?? "Skill"}
    </h1>
  );
};

interface SkillHeaderActionsProps {
  canSaveChanges: boolean;
  isEditing: boolean;
  isSaving: boolean;
  statusLabel: string;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSaveChanges: () => void;
}

const SkillHeaderActions = ({
  canSaveChanges,
  isEditing,
  isSaving,
  statusLabel,
  onBeginEdit,
  onCancelEdit,
  onSaveChanges,
}: SkillHeaderActionsProps) => {
  if (isEditing) {
    return (
      <>
        <p className="hidden text-sm text-muted-foreground md:block">
          {statusLabel}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={onCancelEdit}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canSaveChanges}
          onClick={onSaveChanges}
        >
          <span className="md:hidden">Save</span>
          <span className="hidden md:inline">Save changes</span>
        </Button>
      </>
    );
  }

  return (
    <Button type="button" size="sm" onClick={onBeginEdit}>
      Edit
    </Button>
  );
};

export const SkillDetailView = ({
  skill,
  selectedPath,
  onPathChange,
  onSaveChanges,
}: SkillDetailViewProps) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const skillList = useSkillList();
  const {
    addedPaths,
    addPath: addPathDraft,
    beginEdit,
    cancelEdit,
    changeDescription: changeDescriptionDraft,
    changeDraft,
    changeSkillName: changeSkillNameDraft,
    deletedPaths,
    deletePath: deletePathDraft,
    descriptionDraft,
    draftsByPath,
    isEditing,
    isSaving,
    renamedFromByPath,
    renamePath: renamePathDraft,
    resetForSkill,
    saveStatus,
    setIsSaving,
    skillNameDraft,
    setSaveStatus,
  } = useSkillResourceEditStore();
  const baseFiles = useMemo(() => getSkillFiles(skill), [skill]);
  const files = useMemo(() => {
    const renamedOriginalPaths = new Set(Object.values(renamedFromByPath));

    return [
      ...baseFiles.filter((file) => !renamedOriginalPaths.has(file.path)),
      ...[...addedPaths].map((path) => ({
        mediaType: getTextResourceMediaType(path),
        path,
        size: getTextSize(draftsByPath[path] ?? ""),
      })),
    ];
  }, [addedPaths, baseFiles, draftsByPath, renamedFromByPath]);
  const session = useMemo(
    () =>
      getSkillResourceEditSession({
        addedPaths,
        deletedPaths,
        descriptionDraft,
        draftsByPath,
        isEditing,
        renamedFromByPath,
      }),
    [
      addedPaths,
      deletedPaths,
      descriptionDraft,
      draftsByPath,
      isEditing,
      renamedFromByPath,
    ]
  );
  const requestedPath = selectedPath ?? skillFilePath;
  const selectedFile = files.find((file) => file.path === requestedPath);
  const skillNameValue = skillNameDraft ?? skill?.name ?? "";
  const existingSkillNames = useMemo(
    () =>
      new Set(
        (skillList.data ?? [])
          .map((listSkill) => listSkill.name)
          .filter((name) => name !== skill?.name)
      ),
    [skill?.name, skillList.data]
  );
  const skillNameError = getSkillNameError(skillNameValue, existingSkillNames);
  const skillNameChangeCount = skillNameDraft === undefined ? 0 : 1;
  const changeCount = getChangeCount(session) + skillNameChangeCount;
  const hasPendingChanges = changeCount > 0;
  const canSaveChanges =
    hasPendingChanges && !isSaving && !skillNameError && !skillList.isPending;
  const statusLabel =
    skillNameError ?? getSaveStatusLabel(saveStatus, isSaving, changeCount);

  useEffect(() => {
    resetForSkill();
  }, [resetForSkill, skill?.name, skill?.updatedAt]);

  useEffect(() => {
    if (skill && !selectedFile) {
      onPathChange(skillFilePath);
    }
  }, [onPathChange, selectedFile, skill]);

  useEffect(() => {
    if (!hasPendingChanges && saveStatus === "Unsaved changes") {
      setSaveStatus("No changes");
    }
  }, [hasPendingChanges, saveStatus, setSaveStatus]);

  const addPath = (path: string) => {
    addPathDraft(path);
    onPathChange(path);
  };

  const deletePath = (path: string) => {
    const result = deletePathDraft(path);

    if (result.selectedPath) {
      onPathChange(result.selectedPath);
    }
  };

  const changeDescription = (description: string) => {
    changeDescriptionDraft(description, skill?.description);
  };

  const changeSkillName = (skillName: string) => {
    changeSkillNameDraft(skillName, skill?.name);
  };

  const renamePath = (path: string, nextPath: string, content: string) => {
    const result = renamePathDraft(path, nextPath, content);
    onPathChange(result.selectedPath);
  };

  const saveChanges = async () => {
    if (!hasPendingChanges || skillNameError) {
      return;
    }

    setIsSaving(true);
    setSaveStatus("Saving...");

    try {
      const filesByPath = new Map(files.map((file) => [file.path, file]));
      await onSaveChanges(
        buildResourcePatchInput({
          deletedPaths,
          descriptionDraft,
          draftsByPath,
          filesByPath,
          renamedFromByPath,
          skillNameDraft,
        })
      );
      resetForSkill();
      setSaveStatus("Saved");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <header className="h-(--app-shell-header-height) shrink-0 border-b border-border bg-background px-4 md:px-6">
        <div className="flex h-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
            <SidebarTrigger className="md:hidden" />
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              nativeButton={false}
              render={<Link to="/skills" aria-label="Back to Managed Skills" />}
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0">
              <SkillTitle
                isEditing={isEditing}
                skillName={skill?.name}
                skillNameError={skillNameError}
                skillNameValue={skillNameValue}
                onSkillNameChange={changeSkillName}
              />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 md:gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Skill Version History"
              disabled={!skill}
              onClick={() => setHistoryOpen(true)}
            >
              <HistoryIcon />
            </Button>
            <SkillHeaderActions
              canSaveChanges={canSaveChanges}
              isEditing={isEditing}
              isSaving={isSaving}
              statusLabel={statusLabel}
              onBeginEdit={beginEdit}
              onCancelEdit={cancelEdit}
              onSaveChanges={() => {
                void saveChanges();
              }}
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <SkillDetailFilesPanel
          addedPaths={addedPaths}
          deletedPaths={deletedPaths}
          descriptionValue={descriptionDraft ?? skill?.description ?? ""}
          draftsByPath={draftsByPath}
          files={files}
          isEditing={isEditing}
          selectedFile={selectedFile}
          session={session}
          skill={skill}
          onAddPath={addPath}
          onDeletePath={deletePath}
          onDescriptionChange={changeDescription}
          onDraftChange={changeDraft}
          onRenamePath={renamePath}
          onSelectPath={onPathChange}
        />
      </div>
      <SkillVersionHistoryDialog
        open={historyOpen}
        skillName={skill?.name}
        onOpenChange={setHistoryOpen}
      />
    </>
  );
};
