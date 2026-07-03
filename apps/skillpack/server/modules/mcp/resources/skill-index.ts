import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SkillRow } from "@server/modules/skills/types";
import { buildSkillFileFrontmatter } from "@server/shared/skill-file";
import {
  skillIndexUri,
  toSkillLocation,
} from "@skillpack/core/skill-locations";

import type { SkillpackMcpContext } from "../types";

const sha256Digest = (sha256: string) => `sha256:${sha256}`;

const skillFrontmatter = (skill: SkillRow) =>
  buildSkillFileFrontmatter(
    {
      allowedTools: skill.allowedTools,
      compatibility: skill.compatibility,
      description: skill.description,
      license: skill.license,
      metadata: skill.metadata,
      name: skill.name,
    },
    skill.frontmatter
  );

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
        await context.skillService.listSkillsWithCurrentSkillFile();
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
          url: toSkillLocation(skill.name),
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
