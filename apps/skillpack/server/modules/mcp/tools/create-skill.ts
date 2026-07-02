import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSkillSchema } from "@skillpack/contracts/skills/requests";
import { safeRelativePathSchema } from "@skillpack/core/primitives";
import { z } from "zod";

import { formatSkillMutationResult } from "../presenter";
import type { SkillpackMcpContext } from "../types";

const createSkillResourceSchema = z.object({
  content: z
    .string()
    .describe("UTF-8 text content to store for this resource."),
  mediaType: z
    .string()
    .min(1)
    .describe(
      "MIME type for this resource. Omit to infer from the file extension."
    )
    .optional(),
  path: safeRelativePathSchema.describe(
    "Safe relative resource path such as references/notes.md. SKILL.md is reserved for the main skill file."
  ),
});

const createSkillMcpSchema = z.object({
  allowedTools: createSkillSchema.shape.allowedTools.describe(
    "Optional advisory tool permissions for the skill, serialized as allowed-tools frontmatter."
  ),
  compatibility: createSkillSchema.shape.compatibility.describe(
    "Optional compatibility note, such as supported agents, runtimes, or project types."
  ),
  content: createSkillSchema.shape.content.describe(
    "Markdown instruction body for the generated SKILL.md. Provide the body without YAML frontmatter."
  ),
  description: createSkillSchema.shape.description.describe(
    "Short human-readable summary shown in catalogs and tool results."
  ),
  license: createSkillSchema.shape.license.describe(
    "Optional license or usage terms for this skill."
  ),
  metadata: createSkillSchema.shape.metadata.describe(
    "Optional string key/value metadata serialized into SKILL.md frontmatter."
  ),
  name: createSkillSchema.shape.name.describe(
    "Unique Skill Name for this user. Use lowercase letters, numbers, and hyphens, e.g. code-reviewer."
  ),
  resources: z
    .array(createSkillResourceSchema)
    .default([])
    .describe(
      "Additional text resources to attach to the skill, such as references, examples, or scripts."
    ),
});

const createSkillToolDefinition = {
  annotations: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  description:
    "Creates a new Skillpack Managed Skill for the authenticated user. Use for a new unique Skill Name. Provide the SKILL.md markdown body in content; Skillpack serializes name, description, and optional metadata into frontmatter automatically. Use resources for additional text files.",
  inputSchema: createSkillMcpSchema.shape,
  title: "Create Skillpack Skill",
};

export const registerCreateSkillTool = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerTool(
    "create_skill",
    createSkillToolDefinition,
    async (input) => {
      if (!context.currentUser.canWrite) {
        throw new Error("skills:write scope is required to create skills");
      }

      const result = await context.skillService.createSkill(input);

      return formatSkillMutationResult(result.skill);
    }
  );
};
