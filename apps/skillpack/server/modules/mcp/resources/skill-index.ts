import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import { parseSkillFile } from "@server/shared/skill-file";

import { skillIndexUri, toSkillpackLocation } from "../locators";
import type { SkillpackMcpContext } from "../types";

const sha256Digest = (sha256: string) => `sha256:${sha256}`;

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
      const skills = await context.skillService.listSkills();
      const index = { skills: [] } as {
        skills: {
          digest: string;
          frontmatter: Record<string, unknown>;
          url: string;
        }[];
      };

      for (const { skill } of skills) {
        const skillFile = await context.skillService.readSkillTextFileByName({
          path: skillContentPath,
          skillName: skill.name,
        });
        const parsedSkillFile = parseSkillFile(skillFile.content);

        index.skills.push({
          digest: sha256Digest(skillFile.resource.sha256),
          frontmatter: parsedSkillFile.frontmatter,
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
