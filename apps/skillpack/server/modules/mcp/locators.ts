import { skillContentPath } from "@server/constants";
import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";

const skillUriPrefix = "skill://";
const expectedSkillResourceUri = "Expected skill://{skillName}/{path}";

export const skillIndexUri = "skill://index.json";

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

const decodePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(expectedSkillResourceUri);
  }
};

const parseSkillResourcePath = (path: string) => {
  const parsedPath = safeRelativePathSchema.parse(path);
  if (
    parsedPath !== skillContentPath &&
    parsedPath.split("/").includes(skillContentPath)
  ) {
    throw new Error(expectedSkillResourceUri);
  }

  return parsedPath;
};

export const toSkillpackResourceUri = (
  skillName: string,
  path = skillContentPath
) => `skill://${skillName}/${encodePath(path)}`;

export const toSkillpackLocation = (skillName: string) =>
  toSkillpackResourceUri(skillName, skillContentPath);

export const parseSkillpackResourceUri = (uri: string) => {
  if (
    !uri.startsWith(skillUriPrefix) ||
    uri.includes("?") ||
    uri.includes("#")
  ) {
    throw new Error(expectedSkillResourceUri);
  }

  const segments = uri.slice(skillUriPrefix.length).split("/");
  if (segments.length < 2) {
    throw new Error(expectedSkillResourceUri);
  }

  const [rawSkillName, ...rawPathSegments] = segments;
  const path = rawPathSegments.map(decodePathSegment).join("/");

  return {
    path: parseSkillResourcePath(path),
    skillName: skillNameSchema.parse(decodePathSegment(rawSkillName)),
  };
};
