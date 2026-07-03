import type {
  ResolvedSkill,
  SkillResourceResponse,
} from "@skillpack/contracts/skills/responses";

import { getTextSize, skillFileMediaType, skillFilePath } from "./skill-files";
import type { SkillFile } from "./skill-files";

/**
 * A resource file with its content loaded, ready to render or edit.
 * Matches a fetched {@link SkillResourceResponse} minus its sha256, and
 * the locally-built descriptor returned for SKILL.md and added drafts.
 */
export type ResourceFileContent = Pick<
  SkillResourceResponse,
  "content" | "mediaType" | "path" | "size"
>;

/**
 * Status shown while a resource file's content is being fetched.
 */
export const resourceLoadingFileStatus = "Loading file...";

/**
 * Status shown when no file is selected in a resource explorer.
 */
export const resourceSelectFileStatus = "Select a file";

/**
 * Status shown once a resource file's content is available to display.
 */
export const getLoadedResourceStatus = (path: string) => `Loaded ${path}`;

/**
 * SKILL.md content lives on the resolved skill/version body, not a fetched
 * resource. When SKILL.md is the selected file, build its descriptor from
 * `source.content`; otherwise return undefined so the caller falls back to
 * the fetched resource (or an added draft).
 */
export const getSelectedSkillMarkdownFile = (
  source: Pick<ResolvedSkill, "content"> | undefined,
  selectedFile?: SkillFile
): ResourceFileContent | undefined => {
  if (!(source && selectedFile?.path === skillFilePath)) {
    return;
  }

  return {
    content: source.content,
    mediaType: skillFileMediaType,
    path: skillFilePath,
    size: getTextSize(source.content),
  };
};
