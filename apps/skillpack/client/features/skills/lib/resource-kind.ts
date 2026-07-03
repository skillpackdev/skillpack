import type { ResourceManifestItem } from "@skillpack/contracts/skills/responses";

import { getResourceType } from "@/domain/skills/resource-types";
import type { SkillResourceKind } from "@/domain/skills/resource-types";

export const getSkillResourceKind = (
  resource: Pick<ResourceManifestItem, "mediaType" | "path">
): SkillResourceKind => {
  const entry = getResourceType(resource.path);

  if (resource.mediaType.startsWith("image/") || entry?.kind === "image") {
    return "image";
  }

  if (resource.mediaType.includes("markdown") || entry?.kind === "markdown") {
    return "markdown";
  }

  if (entry?.kind === "code" || resource.path.startsWith("scripts/")) {
    return "code";
  }

  return "text";
};

export const getSkillResourceLanguage = (path: string) =>
  getResourceType(path)?.highlightLanguage ?? "text";
