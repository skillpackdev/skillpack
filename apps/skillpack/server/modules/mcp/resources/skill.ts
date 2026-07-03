import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { skillContentPath } from "@server/constants";
import {
  parseSkillResourceUri,
  toSkillResourceUri,
} from "@skillpack/core/skill-locations";

import type { SkillpackMcpContext } from "../types";

interface ListedMcpResource {
  description?: string;
  mimeType?: string;
  name: string;
  size?: number;
  uri: string;
}

const toInvalidParamsError = (error: unknown) =>
  new McpError(
    ErrorCode.InvalidParams,
    error instanceof Error ? error.message : String(error)
  );

const skillResourceDefinition = {
  description:
    "Files within Skillpack Managed Skill directories, addressed by skill://{skillName}/{path}.",
  title: "Skillpack Skill Resource",
};

export const registerSkillResource = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerResource(
    "skill_resource",
    new ResourceTemplate("skill://{skillName}/{+path}", {
      list: async () => {
        const skills =
          await context.skillService.listSkillsWithCurrentResources();
        const resources: ListedMcpResource[] = [];

        for (const { resources: skillResources, skill } of skills) {
          for (const resource of skillResources) {
            const isSkillFile = resource.path === skillContentPath;
            resources.push({
              description: isSkillFile ? skill.description : undefined,
              mimeType: resource.mediaType,
              name: isSkillFile
                ? skill.name
                : `${skill.name}: ${resource.path}`,
              size: resource.size,
              uri: toSkillResourceUri(skill.name, resource.path),
            });
          }
        }

        return { resources };
      },
    }),
    skillResourceDefinition,
    async (uri) => {
      let parsed: ReturnType<typeof parseSkillResourceUri>;
      try {
        parsed = parseSkillResourceUri(uri.toString());
      } catch (error) {
        throw toInvalidParamsError(error);
      }

      const result = await context.skillService.readSkillTextFileByName(parsed);

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
