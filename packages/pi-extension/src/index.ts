import { AuthStorage } from "@earendil-works/pi-coding-agent";
import type {
  ExtensionAPI,
  ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { SkillpackClient } from "./client";
import type { SkillpackResolvedSkill } from "./client";
import { createSkillpackOAuthProvider } from "./oauth";
import {
  escapeXml,
  formatSkillpackCatalog,
  parseSkillpackLocation,
  skillFilePath,
  toSkillpackLocation,
  toSkillpackResourceLocation,
} from "./skill-location";
import type { SkillpackCatalogItem } from "./skill-location";

const skillpackProviderId = "skillpack";
const catalogTtlMs = 30_000;
interface SkillpackExtensionOptions {
  baseUrl?: string;
  client?: SkillpackClient;
}

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/u, "");

const isSkillpackCredential = (
  credential: unknown
): credential is { baseUrl: string } =>
  typeof credential === "object" &&
  credential !== null &&
  "baseUrl" in credential &&
  typeof credential.baseUrl === "string" &&
  credential.baseUrl.length > 0;

const formatSkillpackCommandOption = (skill: SkillpackCatalogItem) =>
  `${skill.name}  ${toSkillpackLocation(skill.name)}`;

const normalizeSkillArgument = (args: string) => args.trim();

const findSkillByArgument = (skills: SkillpackCatalogItem[], args: string) => {
  const argument = normalizeSkillArgument(args);
  if (argument.length === 0) {
    return;
  }

  if (argument.startsWith("skill://")) {
    return skills.find((skill) => toSkillpackLocation(skill.name) === argument);
  }

  const normalizedArgument = argument.toLowerCase();
  return (
    skills.find((skill) => skill.name.toLowerCase() === normalizedArgument) ??
    skills.find((skill) =>
      skill.name.toLowerCase().startsWith(normalizedArgument)
    )
  );
};

const formatSkillpackSkillContent = (
  skill: Pick<SkillpackResolvedSkill, "name" | "resources">,
  skillFileContent: string
) => {
  const lines = ["<skill>", skillFileContent.trim()];
  const attachedResources = skill.resources.filter(
    (resource) => resource.path !== skillFilePath
  );

  if (attachedResources.length > 0) {
    lines.push("");
    lines.push("<resources>");
    for (const resource of attachedResources) {
      lines.push(
        `  <resource path="${escapeXml(resource.path)}" uri="${escapeXml(toSkillpackResourceLocation(skill.name, resource.path))}" media_type="${escapeXml(resource.mediaType)}" size="${resource.size}" />`
      );
    }
    lines.push("</resources>");
  }

  lines.push("</skill>");
  return lines.join("\n");
};

const formatSkillpackInputExpansion = (
  skill: SkillpackResolvedSkill,
  skillFileContent: string,
  prompt: string
) => {
  const lines = [formatSkillpackSkillContent(skill, skillFileContent)];
  const trimmedPrompt = prompt.trim();
  if (trimmedPrompt.length > 0) {
    lines.push("");
    lines.push(trimmedPrompt);
  }

  return lines.join("\n");
};

const parseSkillpackInput = (text: string) => {
  const match = text.match(/^\/skillpack:([^\s]+)(?:\s+([\s\S]*))?$/u);
  if (!match) {
    return;
  }

  return {
    prompt: match[2] ?? "",
    skillArgument: match[1],
  };
};

export const createSkillpackExtension =
  (options: SkillpackExtensionOptions = {}): ExtensionFactory =>
  (pi: ExtensionAPI) => {
    const authStorage = AuthStorage.create();
    const configuredBaseUrl = options.baseUrl
      ? normalizeBaseUrl(options.baseUrl)
      : undefined;
    const getCredentialBaseUrl = () => {
      authStorage.reload();
      const credential = authStorage.get(skillpackProviderId);
      if (isSkillpackCredential(credential)) {
        return normalizeBaseUrl(credential.baseUrl);
      }

      if (configuredBaseUrl) {
        return configuredBaseUrl;
      }

      throw new Error("Run /login skillpack to configure Skillpack base URL");
    };
    const client =
      options.client ??
      new SkillpackClient({
        getAccessToken: () => {
          authStorage.reload();
          return authStorage.getApiKey(skillpackProviderId);
        },
        getBaseUrl: () => Promise.resolve(getCredentialBaseUrl()),
      });
    let cachedCatalog:
      | {
          expiresAt: number;
          skills: SkillpackCatalogItem[];
          text: string;
        }
      | undefined;

    const getCatalog = async () => {
      const now = Date.now();
      if (!cachedCatalog || cachedCatalog.expiresAt <= now) {
        const skills = await client.listSkills();
        cachedCatalog = {
          expiresAt: now + catalogTtlMs,
          skills,
          text: formatSkillpackCatalog(skills),
        };
      }

      return cachedCatalog;
    };
    const readSkillWithFile = async (location: string) => {
      const skill = await client.readSkill(location);
      const skillFile = await client.readResource(skill.location);
      const skillFileContent =
        skillFile.encoding === "text" ? skillFile.content : skill.content;

      return { skill, skillFileContent };
    };

    pi.registerProvider(skillpackProviderId, {
      oauth: createSkillpackOAuthProvider({ baseUrl: configuredBaseUrl }),
    });

    pi.registerTool({
      description:
        "Read a Skillpack skill or one of its attached resources from a skill:// location.",
      async execute(_toolCallId, params) {
        const location = parseSkillpackLocation(params.location);
        if (location.path === skillFilePath) {
          const { skill, skillFileContent } = await readSkillWithFile(
            params.location
          );

          return {
            content: [
              {
                text: formatSkillpackSkillContent(skill, skillFileContent),
                type: "text",
              },
            ],
            details: {},
          };
        }

        const resource = await client.readResource(params.location);
        return {
          content: [
            {
              text:
                resource.encoding === "text"
                  ? resource.content
                  : `base64:${resource.content}`,
              type: "text",
            },
          ],
          details: {},
        };
      },
      label: "Read Skillpack",
      name: "skillpack_read",
      parameters: Type.Object({
        location: Type.String({
          description:
            "Skillpack location, for example skill://demo-skill/SKILL.md",
        }),
      }),
      promptGuidelines: [
        "Use skillpack_read for Skillpack skill:// locations; filesystem reads handle local files.",
        "Use a SKILL.md URI to read the activation payload with SKILL.md frontmatter and Skillpack resources.",
        "The skill result includes full resource URIs when attached files are available.",
        "Pass the attached resource URI as location to read references, scripts, and assets.",
      ],
      promptSnippet:
        "Read Skillpack skill instructions and attached resources from skill:// locations",
    });

    pi.registerCommand("skillpack", {
      description: "List or activate Skillpack Managed Skills",
      getArgumentCompletions: async (prefix) => {
        const { skills } = await getCatalog();
        const normalizedPrefix = prefix.trim().toLowerCase();
        const matches = skills.filter((skill) => {
          const location = toSkillpackLocation(skill.name);
          return (
            skill.name.toLowerCase().startsWith(normalizedPrefix) ||
            location.startsWith(prefix.trim())
          );
        });

        if (matches.length === 0) {
          return null;
        }

        return matches.map((skill) => ({
          description: skill.description,
          label: skill.name,
          value: skill.name,
        }));
      },
      handler: async (args, ctx) => {
        const { skills } = await getCatalog();
        if (skills.length === 0) {
          ctx.ui.notify("No Skillpack skills found", "warning");
          return;
        }

        let skill = findSkillByArgument(skills, args);
        if (!skill) {
          const selected = await ctx.ui.select(
            "Select Skillpack skill",
            skills.map(formatSkillpackCommandOption)
          );
          if (!selected) {
            return;
          }

          skill = skills.find(
            (candidate) => formatSkillpackCommandOption(candidate) === selected
          );
        }

        if (!skill) {
          ctx.ui.notify(`Unknown Skillpack skill: ${args}`, "error");
          return;
        }

        ctx.ui.setEditorText(`/skillpack:${skill.name} `);
      },
    });

    pi.on("input", async (event, ctx) => {
      if (event.source === "extension") {
        return { action: "continue" };
      }

      const parsed = parseSkillpackInput(event.text);
      if (!parsed) {
        return { action: "continue" };
      }

      try {
        const { skills } = await getCatalog();
        const skill = findSkillByArgument(skills, parsed.skillArgument);
        if (!skill) {
          ctx.ui.notify(
            `Unknown Skillpack skill: ${parsed.skillArgument}`,
            "error"
          );
          return { action: "handled" };
        }

        const location = toSkillpackLocation(skill.name);
        const { skill: resolvedSkill, skillFileContent } =
          await readSkillWithFile(location);
        return {
          action: "transform",
          text: formatSkillpackInputExpansion(
            resolvedSkill,
            skillFileContent,
            parsed.prompt
          ),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to read Skillpack skill: ${message}`, "error");
        return { action: "handled" };
      }
    });

    pi.on("before_agent_start", async (event) => {
      const catalog = await getCatalog();
      if (!catalog.text) {
        return;
      }

      return {
        systemPrompt: `${event.systemPrompt}\n${catalog.text}`,
      };
    });
  };

export default createSkillpackExtension();
