import { skillFilePath } from "./skill-files";

interface DetailHeaderStatusInput {
  changeCount: number;
  isEditing: boolean;
  isSaving: boolean;
  saveStatus: string;
  version: number | undefined;
}

export const getDetailFileSwitcherLabel = (selectedPath?: string): string =>
  `Files · ${selectedPath ?? skillFilePath}`;

export const getDetailHeaderStatus = ({
  changeCount,
  isEditing,
  isSaving,
  saveStatus,
  version,
}: DetailHeaderStatusInput): string => {
  if (!isEditing) {
    return version ? `Version ${version}` : "Version";
  }

  if (isSaving || saveStatus !== "Unsaved changes") {
    return saveStatus;
  }

  const noun = changeCount === 1 ? "change" : "changes";
  return `${changeCount} unsaved ${noun}`;
};
