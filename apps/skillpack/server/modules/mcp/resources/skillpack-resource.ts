import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseSkillpackResourceUri } from "../locators";
import type { SkillpackMcpContext } from "../types";

const skillpackResourceDefinition = {
  description:
    "Attached text resource for a Skillpack Managed Skill, addressed by skillpack-resource://skillpack/{skillName}?path={path}.",
  title: "Skillpack Resource",
};

export const registerSkillpackResource = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerResource(
    "skillpack_resource",
    new ResourceTemplate("skillpack-resource://skillpack/{skillName}{?path}", {
      list: undefined,
    }),
    skillpackResourceDefinition,
    async (uri) => {
      const parsed = parseSkillpackResourceUri(uri);
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
