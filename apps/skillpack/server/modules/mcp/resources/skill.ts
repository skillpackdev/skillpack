import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";

import {
  parseSkillpackLocation,
  toSkillpackLocation,
  toSkillpackResourceUri,
} from "../locators";
import type { SkillpackMcpContext } from "../types";

interface ListedMcpResource {
  description?: string;
  mimeType?: string;
  name: string;
  size?: number;
  uri: string;
}

const skillResourceDefinition = {
  description:
    "Current SKILL.md instructions for a Skillpack Managed Skill, addressed by skill://skillpack/{skillName}.",
  title: "Skillpack Skill",
};

export const registerSkillResource = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerResource(
    "skill",
    new ResourceTemplate("skill://skillpack/{skillName}", {
      list: async () => {
        const skills = await context.skillService.listSkills();
        const resources: ListedMcpResource[] = [];

        for (const { skill } of skills) {
          const resolvedSkill = await context.skillService.resolveSkillByName(
            skill.name
          );
          const skillFile = resolvedSkill.resources.find(
            (resource) => resource.path === skillContentPath
          );

          resources.push({
            description: skill.description,
            mimeType: skillFile?.mediaType,
            name: skill.name,
            size: skillFile?.size,
            uri: toSkillpackLocation(skill.name),
          });

          for (const resource of resolvedSkill.resources) {
            if (resource.path === skillContentPath) {
              continue;
            }

            resources.push({
              mimeType: resource.mediaType,
              name: `${skill.name}: ${resource.path}`,
              size: resource.size,
              uri: toSkillpackResourceUri(skill.name, resource.path),
            });
          }
        }

        return { resources };
      },
    }),
    skillResourceDefinition,
    async (uri) => {
      const parsed = parseSkillpackLocation(uri.toString());
      const result = await context.skillService.readSkillTextFileByName({
        path: skillContentPath,
        skillName: parsed.skillName,
      });

      return {
        contents: [
          {
            mimeType: result.resource.mediaType,
            text: result.content,
            uri: uri.toString(),
          },
        ],
      };
    }
  );
};
