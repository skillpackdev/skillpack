import { StreamableHTTPTransport } from "@hono/mcp";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { skillContentPath } from "@server/constants";
import { parseSkillFile } from "@server/shared/skill-file";
import type { AppBindings } from "@server/types";
import { createSkillSchema } from "@skillpack/contracts/skills/requests";
import {
  safeRelativePathSchema,
  skillNameSchema,
} from "@skillpack/core/primitives";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

const skillpackLocationPattern =
  /^skill:\/\/skillpack\/(?<skillName>[a-z0-9]+(?:-[a-z0-9]+)*)$/u;

const mcpSkillResourceSchema = z.object({
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
    .array(mcpSkillResourceSchema)
    .default([])
    .describe(
      "Additional text resources to attach to the skill, such as references, examples, or scripts."
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
      "New Skill Name. Renames the Skillpack location to skill://skillpack/{name}."
    )
    .optional(),
  skillName: skillNameSchema.describe(
    "Current Skill Name to patch. Use the name segment from skill://skillpack/{skillName}."
  ),
  upsertResources: z
    .array(
      mcpSkillResourceSchema.extend({
        path: safeRelativePathSchema.describe(
          "Safe relative resource path to add or replace. Use SKILL.md to submit a complete skill file whose frontmatter updates metadata and whose body updates skill content."
        ),
      })
    )
    .default([])
    .describe(
      "Text resources to add or replace in the next skill version. Other existing resources stay unchanged."
    ),
});

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const toSkillpackLocation = (skillName: string) =>
  `skill://skillpack/${skillName}`;

const toSkillpackResourceUri = (skillName: string, path: string) =>
  `skillpack-resource://skillpack/${skillName}?path=${encodeURIComponent(path)}`;

const formatSkillMutationResult = (skill: {
  description: string;
  name: string;
}) => ({
  content: [
    {
      text: JSON.stringify(
        {
          description: skill.description,
          location: toSkillpackLocation(skill.name),
          name: skill.name,
        },
        null,
        2
      ),
      type: "text" as const,
    },
  ],
});

const parseSkillpackLocation = (location: string) => {
  const match = skillpackLocationPattern.exec(location);

  if (!match?.groups) {
    throw new Error("Expected skill://skillpack/{skillName}");
  }

  return {
    skillName: skillNameSchema.parse(match.groups.skillName),
  };
};

const parseSkillpackResourceUri = (uri: URL) => {
  if (uri.protocol !== "skillpack-resource:" || uri.hostname !== "skillpack") {
    throw new Error("Expected skillpack-resource://skillpack/{skillName}");
  }

  return {
    path: safeRelativePathSchema.parse(uri.searchParams.get("path")),
    skillName: skillNameSchema.parse(uri.pathname.replace(/^\//u, "")),
  };
};

const formatSkillContent = (
  content: string,
  resources: { mediaType: string; path: string; size: number }[]
) => {
  let formattedContent = `<skill>\n${content}`;
  const attachedResources = resources.filter(
    (resource) => resource.path !== skillContentPath
  );

  if (attachedResources.length > 0) {
    const lines = ["<resources>"];
    for (const resource of attachedResources) {
      lines.push(
        `  <resource path="${escapeXml(resource.path)}" media_type="${escapeXml(resource.mediaType)}" size="${resource.size}" />`
      );
    }
    lines.push("</resources>");

    formattedContent += `${content.endsWith("\n") ? "\n" : "\n\n"}${lines.join("\n")}`;
  }

  return `${formattedContent}\n</skill>`;
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
    allowedTools: input.allowedTools ?? parsedSkillFile.allowedTools,
    compatibility: input.compatibility ?? parsedSkillFile.compatibility,
    content: parsedSkillFile.body,
    description: input.description ?? parsedSkillFile.description,
    license: input.license ?? parsedSkillFile.license,
    metadata: input.metadata ?? parsedSkillFile.metadata,
    name: input.name ?? parsedSkillFile.name,
    upsertResources: input.upsertResources.filter(
      (resource) => resource.path !== skillContentPath
    ),
  };
};

const skillpackMcpInstructions = [
  "Use this server to find and load skills hosted by Skillpack, a remote Agent Skills management system.",
  "At the start of each new user task, call list_skills once. Select relevant skills by matching the task to skill names and descriptions.",
  "For each relevant skill, call read_skill with its skill:// location before planning, editing files, running commands, or calling task-specific tools. Treat the returned SKILL.md as active task guidance for this task.",
  "When a loaded SKILL.md references attached files, call read_skill again with the resource path to load the needed reference, script, example, or asset.",
  "When the user provides a skill:// location, call read_skill for that location.",
  "Use create_skill and update_skill when the user asks to create, improve, or maintain Skillpack skills. Read the existing skill before update_skill. In updates, omitted fields and resources remain unchanged; deleteResourcePaths removes attachments; upsertResources adds or replaces attachments.",
  "Resolve skill:// URIs through Skillpack MCP tools or resources.",
].join(" ");

const createMcpServer = (c: Context<AppBindings>) => {
  const server = new McpServer(
    {
      name: "skillpack-mcp",
      version: "0.1.0",
    },
    {
      instructions: skillpackMcpInstructions,
    }
  );

  server.registerTool(
    "list_skills",
    {
      annotations: {
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Lists the authenticated user's Managed Skills with Skill Name, description, and skill:// location. Use this first to discover exact names and locations before reading or updating a skill.",
      title: "List Skillpack Skills",
    },
    async () => {
      const skills = await c.var.skillService.listSkills();
      return {
        content: [
          {
            text: JSON.stringify(
              {
                skills: skills.map(({ skill }) => ({
                  description: skill.description,
                  location: toSkillpackLocation(skill.name),
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
    }
  );

  server.registerTool(
    "create_skill",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Creates a new Skillpack Managed Skill for the authenticated user. Use for a new unique Skill Name. Provide the SKILL.md markdown body in content; Skillpack serializes name, description, and optional metadata into frontmatter automatically. Use resources for additional text files.",
      inputSchema: createSkillMcpSchema.shape,
      title: "Create Skillpack Skill",
    },
    async (input) => {
      if (!c.var.currentUser.canWrite) {
        throw new Error("skills:write scope is required to create skills");
      }

      const result = await c.var.skillService.createSkill(input);

      return formatSkillMutationResult(result.skill);
    }
  );

  server.registerTool(
    "update_skill",
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      description:
        "Patches an existing Skillpack Managed Skill by current Skill Name. Each successful update appends a recoverable version node and moves the skill head. Call read_skill first when editing existing content. Omitted fields stay unchanged. Use upsertResources to add or replace text resources, deleteResourcePaths to remove attachments, and upsertResources with path SKILL.md to submit a complete SKILL.md whose frontmatter updates metadata and whose body updates skill content.",
      inputSchema: updateSkillMcpSchema.shape,
      title: "Update Skillpack Skill",
    },
    async (rawInput) => {
      const { skillName, ...input } = updateSkillMcpSchema.parse(rawInput);
      if (!c.var.currentUser.canWrite) {
        throw new Error("skills:write scope is required to update skills");
      }

      const result = await c.var.skillService.patchSkillByName(
        skillName,
        toPatchSkillInput(input)
      );

      return formatSkillMutationResult(result);
    }
  );

  server.registerTool(
    "read_skill",
    {
      annotations: {
        openWorldHint: false,
        readOnlyHint: true,
      },
      description:
        "Reads the current SKILL.md for a Skillpack Managed Skill, or reads one attached text resource when path is provided. Use location values returned by list_skills, such as skill://skillpack/demo-skill. Reading SKILL.md returns a <skill> wrapper with the skill file plus a <resources> manifest of attached resources.",
      inputSchema: {
        location: z
          .string()
          .describe("Skillpack location such as skill://skillpack/demo-skill."),
        path: safeRelativePathSchema
          .describe(
            "Attached resource path from the <resources> manifest. Omit or pass SKILL.md to read the main skill file."
          )
          .optional(),
      },
      title: "Read Skillpack Skill",
    },
    async ({ location, path }) => {
      const parsed = parseSkillpackLocation(location);

      if (!path || path === skillContentPath) {
        const resolvedSkill = await c.var.skillService.resolveSkillByName(
          parsed.skillName
        );
        const skillFile = await c.var.skillService.readSkillTextFileByName({
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

      const result = await c.var.skillService.readSkillTextFileByName({
        path,
        skillName: parsed.skillName,
      });

      return {
        content: [{ text: result.content, type: "text" }],
      };
    }
  );

  server.registerResource(
    "skill",
    new ResourceTemplate("skill://skillpack/{skillName}", {
      list: async () => {
        const skills = await c.var.skillService.listSkills();
        const resources = [];

        for (const { skill } of skills) {
          const resolvedSkill = await c.var.skillService.resolveSkillByName(
            skill.name
          );
          const skillFile = resolvedSkill.resources.find(
            (resource) => resource.path === skillContentPath
          );

          resources.push({
            description: skill.description,
            mimeType: skillFile?.mediaType,
            name: skill.name,
            size: skillFile?.size,
            uri: toSkillpackLocation(skill.name),
          });

          for (const resource of resolvedSkill.resources) {
            if (resource.path === skillContentPath) {
              continue;
            }

            resources.push({
              mimeType: resource.mediaType,
              name: `${skill.name}: ${resource.path}`,
              size: resource.size,
              uri: toSkillpackResourceUri(skill.name, resource.path),
            });
          }
        }

        return { resources };
      },
    }),
    {
      description:
        "Current SKILL.md instructions for a Skillpack Managed Skill, addressed by skill://skillpack/{skillName}.",
      title: "Skillpack Skill",
    },
    async (uri) => {
      const parsed = parseSkillpackLocation(uri.toString());
      const result = await c.var.skillService.readSkillTextFileByName({
        path: skillContentPath,
        skillName: parsed.skillName,
      });

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

  server.registerResource(
    "skillpack_resource",
    new ResourceTemplate("skillpack-resource://skillpack/{skillName}{?path}", {
      list: undefined,
    }),
    {
      description:
        "Attached text resource for a Skillpack Managed Skill, addressed by skillpack-resource://skillpack/{skillName}?path={path}.",
      title: "Skillpack Resource",
    },
    async (uri) => {
      const parsed = parseSkillpackResourceUri(uri);
      const result = await c.var.skillService.readSkillTextFileByName(parsed);

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

  return server;
};

export const mcpRoute = new Hono<AppBindings>()
  .post("/", async (c) => {
    const server = createMcpServer(c);
    const transport = new StreamableHTTPTransport({
      enableJsonResponse: true,
      strictAcceptHeader: false,
    });

    await server.connect(transport);

    return await transport.handleRequest(c);
  })
  .all("/", (c) => {
    c.header("Allow", "POST");
    return c.json({ error: "Method Not Allowed" }, 405);
  });
