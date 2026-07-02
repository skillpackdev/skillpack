import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { skillpackMcpInstructions } from "./instructions";
import { registerSkillResource } from "./resources/skill";
import { registerSkillpackResource } from "./resources/skillpack-resource";
import { registerCreateSkillTool } from "./tools/create-skill";
import { registerListSkillsTool } from "./tools/list-skills";
import { registerReadSkillTool } from "./tools/read-skill";
import { registerUpdateSkillTool } from "./tools/update-skill";
import type { SkillpackMcpContext } from "./types";

export const createMcpServer = (context: SkillpackMcpContext) => {
  const server = new McpServer(
    {
      name: "skillpack-mcp",
      version: "0.1.0",
    },
    {
      instructions: skillpackMcpInstructions,
    }
  );

  registerListSkillsTool(server, context);
  registerCreateSkillTool(server, context);
  registerUpdateSkillTool(server, context);
  registerReadSkillTool(server, context);
  registerSkillResource(server, context);
  registerSkillpackResource(server, context);

  return server;
};
