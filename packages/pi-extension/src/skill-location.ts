import {
  parseSkillResourceUri,
  skillFilePath,
  toSkillLocation,
  toSkillResourceUri,
} from "@skillpack/core/skill-locations";

export interface SkillpackCatalogItem {
  description: string;
  name: string;
}

export { skillFilePath };

export const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const toSkillpackResourceLocation = toSkillResourceUri;
export const toSkillpackLocation = toSkillLocation;
export const parseSkillpackLocation = parseSkillResourceUri;

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
