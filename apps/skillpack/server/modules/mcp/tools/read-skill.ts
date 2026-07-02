import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillNameSchema } from "@skillpack/core/primitives";
import { z } from "zod";

import { formatSkillContent } from "../presenter";
import type { SkillpackMcpContext } from "../types";

const readSkillMcpSchema = z.object({
  name: skillNameSchema.describe(
    "Skill Name for the Skillpack Managed Skill to read, such as demo-skill."
  ),
});

const readSkillToolDefinition = {
  annotations: {
    openWorldHint: false,
    readOnlyHint: true,
  },
  description:
    "Reads the current SKILL.md activation payload for a Skillpack Managed Skill by Skill Name. Use names returned by list_skills, such as demo-skill. The result returns a <skill> wrapper with the skill file plus a <resources> manifest of attached resources. Read attached resources through MCP resources/read with their skill:// URIs.",
  inputSchema: readSkillMcpSchema.shape,
  title: "Read Skillpack Skill",
};

export const registerReadSkillTool = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerTool(
    "read_skill",
    readSkillToolDefinition,
    async (rawInput) => {
      const { name } = readSkillMcpSchema.parse(rawInput);
      const activation =
        await context.skillService.readSkillActivationByName(name);

      return {
        content: [
          {
            text: formatSkillContent(
              activation.skillFileContent,
              activation.resources,
              name
            ),
            type: "text",
          },
        ],
      };
    }
  );
};
