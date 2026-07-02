import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";

const skillpackLocationPattern =
  /^skill:\/\/skillpack\/(?<skillName>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;

export const toSkillpackLocation = (skillName: string) =>
  `skill://skillpack/${skillName}`;

export const toSkillpackResourceUri = (skillName: string, path: string) =>
  `skillpack-resource://skillpack/${skillName}?path=${encodeURIComponent(path)}`;

export const parseSkillpackLocation = (location: string) => {
  const match = skillpackLocationPattern.exec(location);

  if (!match?.groups) {
    throw new Error("Expected skill://skillpack/{skillName}");
  }

  return {
    skillName: skillNameSchema.parse(match.groups.skillName),
  };
};

export const parseSkillpackResourceUri = (uri: URL) => {
  if (uri.protocol !== "skillpack-resource:" || uri.hostname !== "skillpack") {
    throw new Error("Expected skillpack-resource://skillpack/{skillName}");
  }

  return {
    path: safeRelativePathSchema.parse(uri.searchParams.get("path")),
    skillName: skillNameSchema.parse(uri.pathname.replace(/^\//u, "")),
  };
};
