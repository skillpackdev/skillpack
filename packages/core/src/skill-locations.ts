import { safeRelativePathSchema, skillNameSchema } from "./primitives";

export interface SkillLocation {
  path: string;
  skillName: string;
}

export const skillFilePath = "SKILL.md";
export const skillIndexUri = "skill://index.json";

const skillUriPrefix = "skill://";
const expectedSkillLocation = "Expected skill://{skillName}/{path}";

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

const decodePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(expectedSkillLocation);
  }
};

const parseSkillResourcePath = (path: string) => {
  const result = safeRelativePathSchema.safeParse(path);
  if (!result.success) {
    throw new Error(expectedSkillLocation);
  }

  const parsedPath = result.data;
  if (
    parsedPath !== skillFilePath &&
    parsedPath.split("/").includes(skillFilePath)
  ) {
    throw new Error(expectedSkillLocation);
  }

  return parsedPath;
};

export const toSkillResourceUri = (skillName: string, path = skillFilePath) =>
  `skill://${skillName}/${encodePath(path)}`;

export const toSkillLocation = (skillName: string) =>
  toSkillResourceUri(skillName, skillFilePath);

export const parseSkillResourceUri = (uri: string): SkillLocation => {
  if (
    !uri.startsWith(skillUriPrefix) ||
    uri.includes("?") ||
    uri.includes("#")
  ) {
    throw new Error(expectedSkillLocation);
  }

  const segments = uri.slice(skillUriPrefix.length).split("/");
  if (segments.length < 2) {
    throw new Error(expectedSkillLocation);
  }

  const [rawSkillName, ...rawPathSegments] = segments;
  const path = rawPathSegments.map(decodePathSegment).join("/");

  const skillName = skillNameSchema.safeParse(decodePathSegment(rawSkillName));
  if (!skillName.success) {
    throw new Error(expectedSkillLocation);
  }

  return {
    path: parseSkillResourcePath(path),
    skillName: skillName.data,
  };
};
