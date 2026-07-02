import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import { safeRelativePathSchema } from "@skillpack/core/primitives";
import { z } from "zod";

import { parseSkillpackLocation } from "../locators";
import { formatSkillContent } from "../presenter";
import type { SkillpackMcpContext } from "../types";

const readSkillMcpSchema = z.object({
  location: z
    .string()
    .describe("Skillpack location such as skill://skillpack/demo-skill."),
  path: safeRelativePathSchema
    .describe(
      "Attached resource path from the <resources> manifest. Omit or pass SKILL.md to read the main skill file."
    )
    .optional(),
});

const readSkillToolDefinition = {
  annotations: {
    openWorldHint: false,
    readOnlyHint: true,
  },
  description:
    "Reads the current SKILL.md for a Skillpack Managed Skill, or reads one attached text resource when path is provided. Use location values returned by list_skills, such as skill://skillpack/demo-skill. Reading SKILL.md returns a <skill> wrapper with the skill file plus a <resources> manifest of attached resources.",
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
      const { location, path } = readSkillMcpSchema.parse(rawInput);
      const parsed = parseSkillpackLocation(location);

      if (!path || path === skillContentPath) {
        const resolvedSkill = await context.skillService.resolveSkillByName(
          parsed.skillName
        );
        const skillFile = await context.skillService.readSkillTextFileByName({
          path: skillContentPath,
          skillName: parsed.skillName,
        });

        return {
          content: [
            {
              text: formatSkillContent(
                skillFile.content,
                resolvedSkill.resources
              ),
              type: "text",
            },
          ],
        };
      }

      const result = await context.skillService.readSkillTextFileByName({
        path,
        skillName: parsed.skillName,
      });

      return {
        content: [{ text: result.content, type: "text" }],
      };
    }
  );
};
