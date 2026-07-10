import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { skillpackMcpInstructions } from "./instructions";
import { registerSkillResource } from "./resources/skill";
import { registerSkillIndexResource } from "./resources/skill-index";
import { registerListSkillsTool } from "./tools/list-skills";
import { registerManageSkillTool } from "./tools/manage-skill";
import { registerReadSkillTool } from "./tools/read-skill";
import type { SkillpackMcpContext } from "./types";

export const createMcpServer = (context: SkillpackMcpContext) => {
  const server = new McpServer(
    {
      name: "skillpack-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        extensions: {
          "io.modelcontextprotocol/skills": {},
        },
      },
      instructions: skillpackMcpInstructions,
    }
  );

  registerListSkillsTool(server, context);
  registerManageSkillTool(server, context);
  registerReadSkillTool(server, context);
  registerSkillIndexResource(server, context);
  registerSkillResource(server, context);

  return server;
};
