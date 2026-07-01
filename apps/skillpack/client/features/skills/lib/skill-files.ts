import type {
  ResolvedSkill,
  ResourceManifestItem,
} from "@skillpack/contracts/skills/responses";

import { getSkillResourceKind } from "./resource-kind";

export const skillFilePath = "SKILL.md";
export const skillFileMediaType = "text/markdown";

export type SkillFile = Pick<
  ResourceManifestItem,
  "mediaType" | "path" | "size"
> & {
  description?: string;
};

export const getTextSize = (content: string) =>
  new TextEncoder().encode(content).length;

export const getSkillFiles = (
  skill: ResolvedSkill | undefined
): SkillFile[] => {
  if (!skill) {
    return [];
  }

  return [
    {
      description: skill.description,
      mediaType: skillFileMediaType,
      path: skillFilePath,
      size: getTextSize(skill.content),
    },
    ...skill.resources.filter((resource) => resource.path !== skillFilePath),
  ];
};

export const getRawResourceUrl = (
  skillName: string | undefined,
  path: string | undefined
) => {
  if (!(skillName && path && path !== skillFilePath)) {
    return;
  }

  const searchParams = new URLSearchParams({ path });
  return `/api/v1/skills/${skillName}/resources/raw?${searchParams}`;
};

export const getRawSkillVersionResourceUrl = (
  skillName: string | undefined,
  versionId: string | undefined,
  path: string | undefined
) => {
  if (!(skillName && versionId && path && path !== skillFilePath)) {
    return;
  }

  const searchParams = new URLSearchParams({ path });
  return `/api/v1/skills/${skillName}/versions/${versionId}/resources/raw?${searchParams}`;
};

export const isEditableTextFile = (file: SkillFile) => {
  if (file.path === skillFilePath) {
    return true;
  }

  const kind = getSkillResourceKind(file);

  if (kind === "image") {
    return false;
  }

  return (
    kind === "code" ||
    kind === "markdown" ||
    file.mediaType.startsWith("text/") ||
    file.mediaType.includes("json") ||
    file.mediaType.includes("yaml")
  );
};

export const canDeleteFile = (file: SkillFile) =>
  file.path !== skillFilePath && isEditableTextFile(file);
