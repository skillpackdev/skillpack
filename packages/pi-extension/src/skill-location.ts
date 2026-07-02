export interface SkillpackLocation {
  path: string;
  skillName: string;
}

export interface SkillpackCatalogItem {
  description: string;
  name: string;
}

export const skillFilePath = "SKILL.md";

const skillUriPrefix = "skill://";
const skillNamePattern = /^(?=.*[a-z])[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const expectedSkillpackLocation = "Expected skill://{skillName}/{path}";

export const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const decodePathSegment = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(expectedSkillpackLocation);
  }
};

const parseSkillName = (value: string) => {
  if (!skillNamePattern.test(value)) {
    throw new Error(expectedSkillpackLocation);
  }

  return value;
};

const isSafeRelativePath = (path: string) =>
  !path.startsWith("/") &&
  !path.includes("\\") &&
  path.split("/").every((part) => part && part !== "." && part !== "..");

const parseSkillResourcePath = (path: string) => {
  if (
    !isSafeRelativePath(path) ||
    (path !== skillFilePath && path.split("/").includes(skillFilePath))
  ) {
    throw new Error(expectedSkillpackLocation);
  }

  return path;
};

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

export const toSkillpackResourceLocation = (
  skillName: string,
  path = skillFilePath
) => `skill://${skillName}/${encodePath(path)}`;

export const toSkillpackLocation = (skillName: string) =>
  toSkillpackResourceLocation(skillName, skillFilePath);

export const parseSkillpackLocation = (location: string): SkillpackLocation => {
  if (
    !location.startsWith(skillUriPrefix) ||
    location.includes("?") ||
    location.includes("#")
  ) {
    throw new Error(expectedSkillpackLocation);
  }

  const segments = location.slice(skillUriPrefix.length).split("/");
  if (segments.length < 2) {
    throw new Error(expectedSkillpackLocation);
  }

  const [rawSkillName, ...rawPathSegments] = segments;
  const path = rawPathSegments.map(decodePathSegment).join("/");
  if (!path) {
    throw new Error(expectedSkillpackLocation);
  }

  return {
    path: parseSkillResourcePath(path),
    skillName: parseSkillName(decodePathSegment(rawSkillName)),
  };
};

export const formatSkillpackCatalog = (skills: SkillpackCatalogItem[]) => {
  if (skills.length === 0) {
    return "";
  }

  const lines = [
    "",
    "The following Skillpack Managed Skills are available through Skill Delivery.",
    "When a task matches a Skillpack skill, call skillpack_read with its skill:// location.",
    "Use skillpack_read with a full skill:// resource URI to read attached references, scripts, and assets.",
    "",
    "<skillpack_skills>",
  ];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`
    );
    lines.push(`    <location>${toSkillpackLocation(skill.name)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</skillpack_skills>");
  return lines.join("\n");
};
