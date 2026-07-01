import { create } from "zustand";

import type { ResourceDraftSession } from "../lib/resource-draft-session";
import { skillFilePath } from "../lib/skill-files";

interface SkillResourceEditState {
  addedPaths: Set<string>;
  deletedPaths: Set<string>;
  descriptionDraft?: string;
  draftsByPath: Record<string, string>;
  isEditing: boolean;
  isSaving: boolean;
  renamedFromByPath: Record<string, string>;
  saveStatus: string;
  skillNameDraft?: string;
}

interface SkillResourceEditActions {
  addPath: (path: string) => void;
  beginEdit: () => void;
  cancelEdit: () => void;
  changeDescription: (
    description: string,
    originalDescription: string | undefined
  ) => void;
  changeDraft: (path: string, content: string, originalContent: string) => void;
  changeSkillName: (
    skillName: string,
    originalSkillName: string | undefined
  ) => void;
  deletePath: (path: string) => { selectedPath?: string };
  renamePath: (
    path: string,
    nextPath: string,
    content: string
  ) => { selectedPath: string };
  resetForSkill: () => void;
  setIsSaving: (isSaving: boolean) => void;
  setSaveStatus: (saveStatus: string) => void;
}

export type SkillResourceEditStore = SkillResourceEditState &
  SkillResourceEditActions;

const initialState: SkillResourceEditState = {
  addedPaths: new Set(),
  deletedPaths: new Set(),
  descriptionDraft: undefined,
  draftsByPath: {},
  isEditing: false,
  isSaving: false,
  renamedFromByPath: {},
  saveStatus: "No changes",
  skillNameDraft: undefined,
};

const removeRecordKey = <Value>(record: Record<string, Value>, key: string) => {
  const { [key]: _removed, ...next } = record;
  return next;
};

const resetDraftState = (): Pick<
  SkillResourceEditState,
  | "addedPaths"
  | "deletedPaths"
  | "descriptionDraft"
  | "draftsByPath"
  | "renamedFromByPath"
  | "saveStatus"
  | "skillNameDraft"
> => ({
  addedPaths: new Set(),
  deletedPaths: new Set(),
  descriptionDraft: undefined,
  draftsByPath: {},
  renamedFromByPath: {},
  saveStatus: "No changes",
  skillNameDraft: undefined,
});

export const useSkillResourceEditStore = create<SkillResourceEditStore>(
  (set, get) => ({
    ...initialState,

    addPath: (path) => {
      set((state) => ({
        addedPaths: new Set(state.addedPaths).add(path),
        draftsByPath: { ...state.draftsByPath, [path]: "" },
        isEditing: true,
        saveStatus: "Unsaved changes",
      }));
    },

    beginEdit: () => set({ isEditing: true }),

    cancelEdit: () => {
      set({ ...resetDraftState(), isEditing: false });
    },

    changeDescription: (description, originalDescription) => {
      set({
        descriptionDraft:
          description === originalDescription ? undefined : description,
        saveStatus: "Unsaved changes",
      });
    },

    changeDraft: (path, content, originalContent) => {
      set((state) => {
        if (!state.addedPaths.has(path) && content === originalContent) {
          return {
            draftsByPath: removeRecordKey(state.draftsByPath, path),
            saveStatus: "Unsaved changes",
          };
        }

        return {
          draftsByPath: { ...state.draftsByPath, [path]: content },
          saveStatus: "Unsaved changes",
        };
      });
    },

    changeSkillName: (skillName, originalSkillName) => {
      set({
        saveStatus: "Unsaved changes",
        skillNameDraft: skillName === originalSkillName ? undefined : skillName,
      });
    },

    deletePath: (path) => {
      const { addedPaths } = get();

      if (addedPaths.has(path)) {
        set((state) => {
          const nextAddedPaths = new Set(state.addedPaths);
          nextAddedPaths.delete(path);

          const nextDeletedPaths = new Set(state.deletedPaths);
          const renamedFromPath = state.renamedFromByPath[path];

          if (renamedFromPath) {
            nextDeletedPaths.delete(renamedFromPath);
          }

          return {
            addedPaths: nextAddedPaths,
            deletedPaths: nextDeletedPaths,
            draftsByPath: removeRecordKey(state.draftsByPath, path),
            renamedFromByPath: removeRecordKey(state.renamedFromByPath, path),
          };
        });

        return { selectedPath: skillFilePath };
      }

      set((state) => {
        const nextDeletedPaths = new Set(state.deletedPaths);

        if (nextDeletedPaths.has(path)) {
          nextDeletedPaths.delete(path);
        } else {
          nextDeletedPaths.add(path);
        }

        return {
          deletedPaths: nextDeletedPaths,
          draftsByPath: removeRecordKey(state.draftsByPath, path),
          saveStatus: "Unsaved changes",
        };
      });

      return {};
    },

    renamePath: (path, nextPath, content) => {
      const previousPath = get().renamedFromByPath[path] ?? path;

      set((state) => {
        const nextAddedPaths = new Set(state.addedPaths);
        nextAddedPaths.delete(path);
        nextAddedPaths.add(nextPath);

        const nextDeletedPaths = new Set(state.deletedPaths);
        nextDeletedPaths.delete(path);
        nextDeletedPaths.add(previousPath);

        return {
          addedPaths: nextAddedPaths,
          deletedPaths: nextDeletedPaths,
          draftsByPath: {
            ...removeRecordKey(state.draftsByPath, path),
            [nextPath]: content,
          },
          renamedFromByPath: {
            ...removeRecordKey(state.renamedFromByPath, path),
            [nextPath]: previousPath,
          },
          saveStatus: "Unsaved changes",
        };
      });

      return { selectedPath: nextPath };
    },

    resetForSkill: () => {
      set({ ...resetDraftState(), isEditing: false, isSaving: false });
    },

    setIsSaving: (isSaving) => set({ isSaving }),

    setSaveStatus: (saveStatus) => set({ saveStatus }),
  })
);

export const getSkillResourceEditSession = ({
  addedPaths,
  deletedPaths,
  descriptionDraft,
  draftsByPath,
  isEditing,
  renamedFromByPath,
}: Pick<
  SkillResourceEditState,
  | "addedPaths"
  | "deletedPaths"
  | "descriptionDraft"
  | "draftsByPath"
  | "isEditing"
  | "renamedFromByPath"
>): ResourceDraftSession => ({
  addedPaths,
  deletedPaths,
  descriptionDraft,
  draftsByPath,
  mode: isEditing ? "edit" : "view",
  renamedFromByPath,
});
