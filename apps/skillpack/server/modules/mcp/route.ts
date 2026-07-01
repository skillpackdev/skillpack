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
  content: z.string(),
  mediaType: z.string().min(1).optional(),
  path: safeRelativePathSchema,
});

const updateSkillMcpSchema = z.object({
  allowedTools: createSkillSchema.shape.allowedTools.optional(),
  compatibility: createSkillSchema.shape.compatibility.optional(),
  deleteResourcePaths: z.array(safeRelativePathSchema).default([]),
  description: createSkillSchema.shape.description.optional(),
  license: createSkillSchema.shape.license.optional(),
  metadata: createSkillSchema.shape.metadata,
  name: skillNameSchema.optional(),
  skillName: skillNameSchema.describe("Skill Name to update."),
  upsertResources: z.array(mcpSkillResourceSchema).default([]),
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

const formatSkillpackCatalog = (
  skills: {
    description: string;
    name: string;
  }[]
) => {
  const lines = [
    "The following Skillpack Managed Skills are available through Skill Delivery.",
    "When a task matches a Skillpack skill, call read_skill with its skill:// location.",
    "Use read_skill with a resource path to read attached references, scripts, and assets.",
    "",
    "<skillpack_skills>",
  ];

  for (const skill of skills) {
    lines.push("  <skill>");
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(
      `    <description>${escapeXml(skill.description)}</description>`
    );
    lines.push(`    <location>${toSkillpackLocation(skill.name)}</location>`);
    lines.push("  </skill>");
  }

  lines.push("</skillpack_skills>");
  return lines.join("\n");
};

const createMcpServer = (c: Context<AppBindings>) => {
  const server = new McpServer(
    {
      name: "skillpack-mcp",
      version: "0.1.0",
    },
    {
      instructions:
        "Use Skillpack MCP tools and resources to read, create, and update authenticated Managed Skills. Updates are patch-based, so agents can safely iterate by writing a better next version. Do not treat skill:// locations as filesystem paths.",
    }
  );

  server.registerTool(
    "list_skills",
    {
      description:
        "List Skillpack Managed Skills available to the authenticated user.",
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
      description:
        "Create a Skillpack Managed Skill in the authenticated user's library.",
      inputSchema: createSkillSchema.shape,
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
      description:
        "Patch a Skillpack Managed Skill. Each successful update appends a recoverable version node and moves the skill head.",
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
      description:
        "Read a Skillpack skill or one attached resource from a skill:// location.",
      inputSchema: {
        location: z
          .string()
          .describe("Skillpack location like skill://skillpack/demo-skill"),
        path: safeRelativePathSchema
          .describe("Safe relative resource path. Omit to read SKILL.md.")
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
    "skillpack_skill",
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
      description: "Skillpack Managed Skill instructions.",
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
      description: "Skillpack Managed Skill attached resource.",
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

  server.registerPrompt(
    "use_skillpack_skills",
    {
      description:
        "Guide an agent to discover and read Skillpack Managed Skills.",
      title: "Use Skillpack Skills",
    },
    async () => {
      const skills = await c.var.skillService.listSkills();

      return {
        messages: [
          {
            content: {
              text: formatSkillpackCatalog(
                skills.map(({ skill }) => ({
                  description: skill.description,
                  name: skill.name,
                }))
              ),
              type: "text",
            },
            role: "user",
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
