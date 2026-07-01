import type { PatchSkillInput } from "@skillpack/contracts/skills/requests";
import { safeRelativePathSchema } from "@skillpack/core/primitives";

import { skillFilePath } from "./skill-files";

interface DraftFileInfo {
  mediaType: string;
  path: string;
}

interface BuildResourcePatchInputParams {
  deletedPaths: Set<string>;
  descriptionDraft?: string;
  draftsByPath: Record<string, string>;
  filesByPath: Map<string, DraftFileInfo>;
  renamedFromByPath?: Record<string, string>;
  skillNameDraft?: string;
}

const extensionMediaTypes = new Map<string, string>([
  ["bash", "text/x-shellscript"],
  ["cjs", "text/javascript"],
  ["js", "text/javascript"],
  ["json", "application/json"],
  ["jsx", "text/javascript"],
  ["md", "text/markdown"],
  ["mjs", "text/javascript"],
  ["py", "text/x-python"],
  ["sh", "text/x-shellscript"],
  ["ts", "application/typescript"],
  ["tsx", "application/typescript"],
  ["txt", "text/plain"],
  ["yaml", "application/yaml"],
  ["yml", "application/yaml"],
]);

const getExtension = (path: string) =>
  path.split(".").pop()?.toLowerCase() ?? "";

export const getTextResourceMediaType = (path: string) =>
  extensionMediaTypes.get(getExtension(path)) ?? "text/plain";

export const validateNewResourcePath = (
  path: string,
  existingPaths: Set<string>
) => {
  const parsed = safeRelativePathSchema.safeParse(path);

  if (!parsed.success) {
    return parsed.error.issues.at(0)?.message ?? "Invalid file path";
  }

  if (path === skillFilePath) {
    return "SKILL.md is reserved";
  }

  if (existingPaths.has(path)) {
    return "File already exists";
  }

  return null;
};

export const buildResourcePatchInput = ({
  deletedPaths,
  descriptionDraft,
  draftsByPath,
  filesByPath,
  renamedFromByPath: _renamedFromByPath = {},
  skillNameDraft,
}: BuildResourcePatchInputParams): PatchSkillInput => {
  const upsertResources: NonNullable<PatchSkillInput["upsertResources"]> = [];
  const deleteResourcePaths = [...deletedPaths].filter(
    (path) => path !== skillFilePath
  );
  const input: PatchSkillInput = {
    deleteResourcePaths,
    upsertResources,
  };

  for (const [path, content] of Object.entries(draftsByPath)) {
    if (deletedPaths.has(path)) {
      continue;
    }

    if (path === skillFilePath) {
      input.content = content;
      continue;
    }

    upsertResources.push({
      content,
      mediaType:
        filesByPath.get(path)?.mediaType ?? getTextResourceMediaType(path),
      path,
    });
  }

  if (descriptionDraft !== undefined) {
    input.description = descriptionDraft;
  }

  if (skillNameDraft !== undefined) {
    input.name = skillNameDraft;
  }

  return input;
};
