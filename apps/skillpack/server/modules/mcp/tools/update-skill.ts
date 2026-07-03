import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import { patchedValue } from "@server/lib/patch";
import { parseSkillFile } from "@server/shared/skill-file";
import { createSkillSchema } from "@skillpack/contracts/skills/requests";
import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { z } from "zod";

import { formatSkillMutationResult } from "../presenter";
import type { SkillpackMcpContext } from "../types";

const updateSkillResourceSchema = z.object({
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
    "Safe relative resource path to add or replace. Use SKILL.md to submit a complete skill file whose frontmatter updates metadata and whose body updates skill content."
  ),
});

const updateSkillMcpSchema = z.object({
  allowedTools: createSkillSchema.shape.allowedTools
    .describe(
      "New advisory tool permissions. Omit to keep the current value; pass null to clear it."
    )
    .optional(),
  compatibility: createSkillSchema.shape.compatibility
    .describe(
      "New compatibility note. Omit to keep the current value; pass null to clear it."
    )
    .optional(),
  deleteResourcePaths: z
    .array(safeRelativePathSchema)
    .default([])
    .describe("Attached resource paths to remove from the next skill version."),
  description: createSkillSchema.shape.description
    .describe("New catalog description. Omit to keep the current description.")
    .optional(),
  license: createSkillSchema.shape.license
    .describe(
      "New license or usage terms. Omit to keep the current value; pass null to clear it."
    )
    .optional(),
  metadata: createSkillSchema.shape.metadata.describe(
    "New string key/value metadata. Omit to keep the current metadata; pass null to clear it."
  ),
  name: skillNameSchema
    .describe(
      "New Skill Name. Renames the Skillpack location to skill://{name}/SKILL.md."
    )
    .optional(),
  skillName: skillNameSchema.describe(
    "Current Skill Name to patch. Use the name segment from skill://{skillName}/SKILL.md."
  ),
  upsertResources: z
    .array(updateSkillResourceSchema)
    .default([])
    .describe(
      "Text resources to add or replace in the next skill version. Other existing resources stay unchanged."
    ),
});

const updateSkillToolDefinition = {
  annotations: {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  description:
    "Patches an existing Skillpack Managed Skill by current Skill Name. Each successful update appends a recoverable version node and moves the skill head. Call read_skill with the Skill Name first when editing existing content. Omitted fields stay unchanged. Use upsertResources to add or replace text resources, deleteResourcePaths to remove attachments, and upsertResources with path SKILL.md to submit a complete SKILL.md whose frontmatter updates metadata and whose body updates skill content.",
  inputSchema: updateSkillMcpSchema.shape,
  title: "Update Skillpack Skill",
};

type UpdateSkillMcpInput = Omit<
  z.infer<typeof updateSkillMcpSchema>,
  "skillName"
>;

const toPatchSkillInput = (input: UpdateSkillMcpInput) => {
  const skillFileResource = input.upsertResources.find(
    (resource) => resource.path === skillContentPath
  );

  if (!skillFileResource) {
    return input;
  }

  const parsedSkillFile = parseSkillFile(skillFileResource.content);

  return {
    ...input,
    allowedTools: patchedValue(
      input,
      "allowedTools",
      parsedSkillFile.allowedTools
    ),
    compatibility: patchedValue(
      input,
      "compatibility",
      parsedSkillFile.compatibility
    ),
    content: parsedSkillFile.body,
    description: patchedValue(
      input,
      "description",
      parsedSkillFile.description
    ),
    license: patchedValue(input, "license", parsedSkillFile.license),
    metadata: patchedValue(input, "metadata", parsedSkillFile.metadata),
    name: patchedValue(input, "name", parsedSkillFile.name),
    upsertResources: input.upsertResources.filter(
      (resource) => resource.path !== skillContentPath
    ),
  };
};

export const registerUpdateSkillTool = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerTool(
    "update_skill",
    updateSkillToolDefinition,
    async (rawInput) => {
      const { skillName, ...input } = updateSkillMcpSchema.parse(rawInput);
      if (!context.currentUser.canWrite) {
        throw new Error("skills:write scope is required to update skills");
      }

      const result = await context.skillService.patchSkillByName(
        skillName,
        toPatchSkillInput(input)
      );

      return formatSkillMutationResult(result);
    }
  );
};
