export type EditorLanguage =
  | "javascript"
  | "json"
  | "markdown"
  | "python"
  | "shell"
  | "yaml";

export type SkillResourceKind = "code" | "image" | "markdown" | "text";

export interface ResourceTypeEntry {
  editorLanguage?: EditorLanguage;
  highlightLanguage?: string;
  kind: SkillResourceKind;
  mediaType?: string;
}

const resourceTypeRegistry = new Map<string, ResourceTypeEntry>([
  [
    "bash",
    {
      editorLanguage: "shell",
      highlightLanguage: "bash",
      kind: "code",
      mediaType: "text/x-shellscript",
    },
  ],
  [
    "cjs",
    {
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    },
  ],
  [
    "js",
    {
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    },
  ],
  [
    "jsx",
    {
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    },
  ],
  [
    "mjs",
    {
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    },
  ],
  [
    "json",
    {
      editorLanguage: "json",
      highlightLanguage: "json",
      kind: "code",
      mediaType: "application/json",
    },
  ],
  [
    "md",
    {
      editorLanguage: "markdown",
      kind: "markdown",
      mediaType: "text/markdown",
    },
  ],
  [
    "py",
    {
      editorLanguage: "python",
      highlightLanguage: "python",
      kind: "code",
      mediaType: "text/x-python",
    },
  ],
  [
    "sh",
    {
      editorLanguage: "shell",
      highlightLanguage: "bash",
      kind: "code",
      mediaType: "text/x-shellscript",
    },
  ],
  [
    "ts",
    {
      editorLanguage: "javascript",
      highlightLanguage: "typescript",
      kind: "code",
      mediaType: "application/typescript",
    },
  ],
  [
    "tsx",
    {
      editorLanguage: "javascript",
      highlightLanguage: "typescript",
      kind: "code",
      mediaType: "application/typescript",
    },
  ],
  ["txt", { kind: "text", mediaType: "text/plain" }],
  [
    "yaml",
    {
      editorLanguage: "yaml",
      highlightLanguage: "yaml",
      kind: "code",
      mediaType: "application/yaml",
    },
  ],
  [
    "yml",
    {
      editorLanguage: "yaml",
      highlightLanguage: "yaml",
      kind: "code",
      mediaType: "application/yaml",
    },
  ],
  ["gif", { kind: "image" }],
  ["jpeg", { kind: "image" }],
  ["jpg", { kind: "image" }],
  ["png", { kind: "image" }],
  ["webp", { kind: "image" }],
]);

export const getExtension = (path: string): string =>
  path.split(".").pop()?.toLowerCase() ?? "";

export const getResourceTypeByExtension = (
  extension: string
): ResourceTypeEntry | undefined => resourceTypeRegistry.get(extension);

export const getResourceType = (path: string): ResourceTypeEntry | undefined =>
  getResourceTypeByExtension(getExtension(path));

export const mediaTypeEditorLanguageMap: Record<string, EditorLanguage> = {
  "application/javascript": "javascript",
  "application/json": "json",
  "application/typescript": "javascript",
  "application/x-sh": "shell",
  "application/x-yaml": "yaml",
  "text/javascript": "javascript",
  "text/markdown": "markdown",
  "text/x-python": "python",
  "text/x-shellscript": "shell",
  "text/yaml": "yaml",
};
