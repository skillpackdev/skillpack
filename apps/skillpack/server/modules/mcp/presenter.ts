import { skillContentPath } from "@server/constants";
import {
  toSkillLocation,
  toSkillResourceUri,
} from "@skillpack/core/skill-locations";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const formatSkillMutationResult = (skill: {
  description: string;
  name: string;
}) => ({
  content: [
    {
      text: JSON.stringify(
        {
          description: skill.description,
          location: toSkillLocation(skill.name),
          name: skill.name,
        },
        null,
        2
      ),
      type: "text" as const,
    },
  ],
});

export const formatSkillContent = (
  content: string,
  resources: { mediaType: string; path: string; size: number }[],
  skillName: string
) => {
  let formattedContent = `<skill>\n${content}`;
  const attachedResources = resources.filter(
    (resource) => resource.path !== skillContentPath
  );

  if (attachedResources.length > 0) {
    const lines = ["<resources>"];
    for (const resource of attachedResources) {
      lines.push(
        `  <resource path="${escapeXml(resource.path)}" uri="${escapeXml(toSkillResourceUri(skillName, resource.path))}" media_type="${escapeXml(resource.mediaType)}" size="${resource.size}" />`
      );
    }
    lines.push("</resources>");

    formattedContent += `${content.endsWith("\n") ? "\n" : "\n\n"}${lines.join("\n")}`;
  }

  return `${formattedContent}\n</skill>`;
};
