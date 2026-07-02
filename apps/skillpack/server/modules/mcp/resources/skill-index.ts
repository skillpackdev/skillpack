import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import type { SkillRow } from "@server/modules/skills/types";

import { skillIndexUri, toSkillpackLocation } from "../locators";
import type { SkillpackMcpContext } from "../types";

const sha256Digest = (sha256: string) => `sha256:${sha256}`;

const optionalFrontmatterEntry = (value: unknown) =>
  value === null || value === undefined || value === "" ? undefined : value;

const skillFrontmatter = (skill: SkillRow) => ({
  "allowed-tools": optionalFrontmatterEntry(skill.allowedTools),
  compatibility: optionalFrontmatterEntry(skill.compatibility),
  description: skill.description,
  license: optionalFrontmatterEntry(skill.license),
  metadata: optionalFrontmatterEntry(skill.metadata),
  name: skill.name,
});

const skillIndexResourceDefinition = {
  description:
    "Well-known SEP-2640 index of Skillpack Managed Skills served by this MCP server.",
  mimeType: "application/json",
  title: "Skillpack Skill Index",
};

export const registerSkillIndexResource = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerResource(
    "index.json",
    skillIndexUri,
    skillIndexResourceDefinition,
    async () => {
      const skills =
        await context.skillService.listSkillsWithCurrentResource(
          skillContentPath
        );
      const index = { skills: [] } as {
        skills: {
          digest: string;
          frontmatter: Record<string, unknown>;
          url: string;
        }[];
      };

      for (const { resource, skill } of skills) {
        index.skills.push({
          digest: sha256Digest(resource.sha256),
          frontmatter: skillFrontmatter(skill),
          url: toSkillpackLocation(skill.name),
        });
      }

      return {
        contents: [
          {
            mimeType: "application/json",
            text: JSON.stringify(index, null, 2),
            uri: skillIndexUri,
          },
        ],
      };
    }
  );
};
