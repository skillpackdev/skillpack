import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toSkillLocation } from "@skillpack/core/skill-locations";

import type { SkillpackMcpContext } from "../types";

const listSkillsToolDefinition = {
  annotations: {
    openWorldHint: false,
    readOnlyHint: true,
  },
  description:
    "Lists the authenticated user's Managed Skills with Skill Name, description, and canonical skill:// location. Use this first to discover exact names before reading or updating a skill.",
  title: "List Skillpack Skills",
};

export const registerListSkillsTool = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerTool("list_skills", listSkillsToolDefinition, async () => {
    const skills = await context.skillService.listSkills();
    return {
      content: [
        {
          text: JSON.stringify(
            {
              skills: skills.map(({ skill }) => ({
                description: skill.description,
                location: toSkillLocation(skill.name),
                name: skill.name,
              })),
            },
            null,
            2
          ),
          type: "text",
        },
      ],
    };
  });
};
