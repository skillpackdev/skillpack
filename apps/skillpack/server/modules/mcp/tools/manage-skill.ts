import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import { applyTextPatch } from "@server/shared/patch-text";
import { parseSkillFile } from "@server/shared/skill-file";
import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import { z } from "zod";

import { SkillModuleError } from "../../skills/errors";
import { formatManageSkillError, formatManageSkillSuccess } from "../presenter";
import type { SkillpackMcpContext } from "../types";

const manageSkillMcpSchema = z.object({
  action: z
    .enum(["create", "patch", "edit", "delete", "write_file", "remove_file"])
    .describe(
      "create: new skill from a full SKILL.md. patch: replace old_string with new_string (preferred for edits). edit: replace the entire SKILL.md. delete: remove the skill. write_file: add or replace an attached resource. remove_file: delete an attached resource."
    ),
  content: z
    .string()
    .optional()
    .describe(
      "create/edit: complete SKILL.md with YAML frontmatter. write_file: UTF-8 file content."
    ),
  file_content: z
    .string()
    .optional()
    .describe("write_file: UTF-8 file content. Alias of content."),
  file_path: safeRelativePathSchema
    .optional()
    .describe(
      "write_file/remove_file: relative resource path such as references/notes.md. patch: optional file to patch; defaults to SKILL.md."
    ),
  mediaType: z
    .string()
    .min(1)
    .optional()
    .describe("write_file: MIME type. Omit to infer from the extension."),
  name: skillNameSchema.describe(
    "Skill Name, e.g. code-reviewer. Required for every action."
  ),
  new_string: z
    .string()
    .optional()
    .describe(
      "patch: replacement text for old_string. Use an empty string to delete matched text."
    ),
  old_string: z
    .string()
    .optional()
    .describe(
      "patch: exact text to find. Must match once unless replace_all is true. Include surrounding context to disambiguate."
    ),
  replace_all: z
    .boolean()
    .default(false)
    .describe(
      "patch: replace every occurrence of old_string instead of requiring a unique match."
    ),
});

type ManageSkillInput = z.infer<typeof manageSkillMcpSchema>;

const manageSkillToolDefinition = {
  annotations: {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  description: [
    "Manage Skillpack Managed Skills for the authenticated user. Skills are procedural memory: reusable approaches for recurring task types.",
    "Actions: create (full SKILL.md), patch (old_string/new_string — preferred for fixes), edit (full SKILL.md rewrite — major overhauls only), delete, write_file, remove_file.",
    "Create when: a complex workflow succeeded, errors were overcome, the user corrected your approach, or the user asks you to remember a procedure.",
    "Update when: instructions are stale or wrong, steps or pitfalls were missing during use. If you used a skill and hit issues not covered by it, patch it immediately.",
    "Before patch or edit, call read_skill with the Skill Name. Prefer patch for targeted changes; use edit only when rewriting most of the SKILL.md.",
    "For attached references, scripts, or examples, use write_file and remove_file. SKILL.md changes go through create, edit, or patch.",
    "Every successful mutation appends a recoverable version. Returns JSON with ok, action, and skill on success, or ok false with error code and message on failure.",
  ].join(" "),
  inputSchema: manageSkillMcpSchema.shape,
  title: "Manage Skillpack Skill",
};

const requireWriteAccess = (context: SkillpackMcpContext) => {
  if (!context.currentUser.canWrite) {
    return formatManageSkillError(
      "forbidden",
      "skills:write scope is required to manage skills"
    );
  }

  return null;
};

const toManageSkillError = (error: unknown) => {
  if (error instanceof SkillModuleError) {
    return formatManageSkillError(error.code, error.message);
  }

  const message =
    error instanceof Error ? error.message : "Unexpected manage_skill error.";

  return formatManageSkillError("internal-error", message);
};

const validateSkillFileContent = (content: string, action: string) => {
  try {
    return { ok: true as const, parsed: parseSkillFile(content) };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : `Invalid SKILL.md content for ${action}.`;

    return formatManageSkillError("invalid-skill-file", message);
  }
};

const assertFrontmatterNameMatches = (
  submittedName: string,
  parsedName: string
) => {
  if (parsedName !== submittedName) {
    return formatManageSkillError(
      "name-mismatch",
      `SKILL.md frontmatter name '${parsedName}' must match the name parameter '${submittedName}'.`
    );
  }

  return null;
};

const toSkillPatchFromContent = (content: string) => {
  const validation = validateSkillFileContent(content, "edit");
  if (!("parsed" in validation)) {
    return validation;
  }

  const { parsed } = validation;

  return {
    allowedTools: parsed.allowedTools,
    compatibility: parsed.compatibility,
    content: parsed.body,
    deleteResourcePaths: [],
    description: parsed.description,
    license: parsed.license,
    metadata: parsed.metadata,
    name: parsed.name,
    upsertResources: [],
  };
};

const handleCreate = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  if (!input.content) {
    return formatManageSkillError(
      "missing-content",
      "content is required for create. Provide the full SKILL.md text (frontmatter + body)."
    );
  }

  const validation = validateSkillFileContent(input.content, "create");
  if (!("parsed" in validation)) {
    return validation;
  }

  const nameMismatch = assertFrontmatterNameMatches(
    input.name,
    validation.parsed.name
  );
  if (nameMismatch) {
    return nameMismatch;
  }

  try {
    const result = await context.skillService.createSkill({
      allowedTools: validation.parsed.allowedTools,
      compatibility: validation.parsed.compatibility,
      content: validation.parsed.body,
      description: validation.parsed.description,
      license: validation.parsed.license,
      metadata: validation.parsed.metadata,
      name: validation.parsed.name,
      resources: [],
    });

    return formatManageSkillSuccess("create", result.skill);
  } catch (error) {
    return toManageSkillError(error);
  }
};

const handleEdit = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  if (!input.content) {
    return formatManageSkillError(
      "missing-content",
      "content is required for edit. Provide the full updated SKILL.md text."
    );
  }

  const patchInput = toSkillPatchFromContent(input.content);
  if (!("upsertResources" in patchInput)) {
    return patchInput;
  }

  const nameMismatch = assertFrontmatterNameMatches(
    input.name,
    patchInput.name ?? input.name
  );
  if (nameMismatch) {
    return nameMismatch;
  }

  try {
    const result = await context.skillService.patchSkillByName(
      input.name,
      patchInput
    );

    return formatManageSkillSuccess("edit", result);
  } catch (error) {
    return toManageSkillError(error);
  }
};

const handlePatch = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  if (!input.old_string) {
    return formatManageSkillError(
      "missing-old-string",
      "old_string is required for patch."
    );
  }

  if (input.new_string === undefined) {
    return formatManageSkillError(
      "missing-new-string",
      "new_string is required for patch. Use an empty string to delete matched text."
    );
  }

  const targetPath = input.file_path ?? skillContentPath;

  if (targetPath === skillContentPath) {
    try {
      const activation = await context.skillService.readSkillActivationByName(
        input.name
      );
      const patchResult = applyTextPatch(
        activation.skillFileContent,
        input.old_string,
        input.new_string,
        input.replace_all
      );

      if (!patchResult.ok) {
        return formatManageSkillError(patchResult.code, patchResult.message);
      }

      const patchInput = toSkillPatchFromContent(patchResult.content);
      if (!("upsertResources" in patchInput)) {
        return patchInput;
      }

      const result = await context.skillService.patchSkillByName(
        input.name,
        patchInput
      );

      return formatManageSkillSuccess("patch", result);
    } catch (error) {
      return toManageSkillError(error);
    }
  }

  try {
    const file = await context.skillService.readSkillTextFileByName({
      path: targetPath,
      skillName: input.name,
    });
    const patchResult = applyTextPatch(
      file.content,
      input.old_string,
      input.new_string,
      input.replace_all
    );

    if (!patchResult.ok) {
      return formatManageSkillError(patchResult.code, patchResult.message);
    }

    const result = await context.skillService.patchSkillByName(input.name, {
      deleteResourcePaths: [],
      upsertResources: [
        {
          content: patchResult.content,
          mediaType: file.resource.mediaType,
          path: targetPath,
        },
      ],
    });

    return formatManageSkillSuccess("patch", result);
  } catch (error) {
    return toManageSkillError(error);
  }
};

const handleDelete = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  try {
    await context.skillService.deleteSkillByName(input.name);

    return formatManageSkillSuccess("delete", {
      description: "",
      name: input.name,
    });
  } catch (error) {
    return toManageSkillError(error);
  }
};

const handleWriteFile = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  const fileContent = input.file_content ?? input.content;

  if (!input.file_path) {
    return formatManageSkillError(
      "missing-file-path",
      "file_path is required for write_file. Example: references/api-guide.md"
    );
  }

  if (fileContent === undefined) {
    return formatManageSkillError(
      "missing-file-content",
      "file_content is required for write_file."
    );
  }

  if (input.file_path === skillContentPath) {
    return formatManageSkillError(
      "reserved-resource-path",
      "SKILL.md is reserved. Use edit or patch to change the main skill file."
    );
  }

  try {
    const result = await context.skillService.patchSkillByName(input.name, {
      deleteResourcePaths: [],
      upsertResources: [
        {
          content: fileContent,
          mediaType: input.mediaType,
          path: input.file_path,
        },
      ],
    });

    return formatManageSkillSuccess("write_file", result);
  } catch (error) {
    return toManageSkillError(error);
  }
};

const handleRemoveFile = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  if (!input.file_path) {
    return formatManageSkillError(
      "missing-file-path",
      "file_path is required for remove_file."
    );
  }

  if (input.file_path === skillContentPath) {
    return formatManageSkillError(
      "reserved-resource-path",
      "SKILL.md is reserved. Use delete to remove the entire skill."
    );
  }

  try {
    const activation = await context.skillService.readSkillActivationByName(
      input.name
    );
    const resourceExists = activation.resources.some(
      (resource) => resource.path === input.file_path
    );

    if (!resourceExists) {
      const availablePaths = activation.resources
        .map((resource) => resource.path)
        .filter((path) => path !== skillContentPath);

      return formatManageSkillError(
        "skill-file-not-found",
        availablePaths.length > 0
          ? `File '${input.file_path}' not found in skill '${input.name}'. Available files: ${availablePaths.join(", ")}`
          : `File '${input.file_path}' not found in skill '${input.name}'.`
      );
    }

    const result = await context.skillService.patchSkillByName(input.name, {
      deleteResourcePaths: [input.file_path],
      upsertResources: [],
    });

    return formatManageSkillSuccess("remove_file", result);
  } catch (error) {
    return toManageSkillError(error);
  }
};

export const registerManageSkillTool = (
  server: McpServer,
  context: SkillpackMcpContext
) => {
  server.registerTool(
    "manage_skill",
    manageSkillToolDefinition,
    async (rawInput) => {
      const writeAccessError = requireWriteAccess(context);
      if (writeAccessError) {
        return writeAccessError;
      }

      const input = manageSkillMcpSchema.parse(rawInput);

      switch (input.action) {
        case "create": {
          return await handleCreate(context, input);
        }
        case "edit": {
          return await handleEdit(context, input);
        }
        case "patch": {
          return await handlePatch(context, input);
        }
        case "delete": {
          return await handleDelete(context, input);
        }
        case "write_file": {
          return await handleWriteFile(context, input);
        }
        case "remove_file": {
          return await handleRemoveFile(context, input);
        }
        default: {
          return formatManageSkillError(
            "invalid-action",
            `Unknown action '${input.action}'.`
          );
        }
      }
    }
  );
};
