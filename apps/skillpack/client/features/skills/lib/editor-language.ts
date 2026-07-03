import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

import {
  getExtension,
  getResourceType,
  mediaTypeEditorLanguageMap,
} from "@/domain/skills/resource-types";
import type { EditorLanguage } from "@/domain/skills/resource-types";

interface EditorLanguageInput {
  mediaType: string | undefined;
  path: string;
}

const getEditorLanguage = ({
  mediaType,
  path,
}: EditorLanguageInput): EditorLanguage | undefined => {
  const editorLanguage = getResourceType(path)?.editorLanguage;
  if (editorLanguage) {
    return editorLanguage;
  }

  if (mediaType) {
    return mediaTypeEditorLanguageMap[mediaType];
  }
};

const loadJavaScriptLanguage = async (path: string) => {
  const { javascript } = await import("@codemirror/lang-javascript");
  const extension = getExtension(path);

  return javascript({
    jsx: extension === "jsx" || extension === "tsx",
    typescript: extension === "ts" || extension === "tsx",
  });
};

export const loadEditorLanguage = async (
  input: EditorLanguageInput
): Promise<Extension[]> => {
  const language = getEditorLanguage(input);

  switch (language) {
    case "javascript": {
      return [await loadJavaScriptLanguage(input.path)];
    }
    case "json": {
      const { json } = await import("@codemirror/lang-json");
      return [json()];
    }
    case "markdown": {
      const { markdown, markdownLanguage } =
        await import("@codemirror/lang-markdown");
      return [markdown({ base: markdownLanguage })];
    }
    case "python": {
      const { python } = await import("@codemirror/lang-python");
      return [python()];
    }
    case "shell": {
      const { shell } = await import("@codemirror/legacy-modes/mode/shell");
      return [StreamLanguage.define(shell)];
    }
    case "yaml": {
      const { yaml } = await import("@codemirror/lang-yaml");
      return [yaml()];
    }
    default: {
      return [];
    }
  }
};
