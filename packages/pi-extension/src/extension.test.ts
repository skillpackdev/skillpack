import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";

import type { SkillpackClient } from "./client";
import { createSkillpackExtension } from "./index";

interface ToolRegistration {
  execute: (...args: unknown[]) => Promise<unknown>;
  name: string;
}

type EventHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

interface CommandRegistration {
  getArgumentCompletions?: (
    prefix: string
  ) => Promise<unknown[] | null> | unknown[] | null;
  handler: (args: string, ctx: unknown) => Promise<void>;
}

const createPiHarness = () => {
  const tools = new Map<string, ToolRegistration>();
  const handlers = new Map<string, EventHandler>();
  const commands = new Map<string, CommandRegistration>();
  const providers = new Map<string, unknown>();

  const pi = {
    on: vi.fn<(event: string, handler: EventHandler) => void>(
      (event, handler) => {
        handlers.set(event, handler);
      }
    ),
    registerCommand: vi.fn<
      (name: string, command: CommandRegistration) => void
    >((name, command) => {
      commands.set(name, command);
    }),
    registerProvider: vi.fn<(name: string, provider: unknown) => void>(
      (name, provider) => {
        providers.set(name, provider);
      }
    ),
    registerTool: vi.fn<(tool: ToolRegistration) => void>((tool) => {
      tools.set(tool.name, tool);
    }),
    sendUserMessage: vi.fn<(content: string, options?: unknown) => void>(),
  } as unknown as ExtensionAPI;

  return { commands, handlers, pi, providers, tools };
};

const demoSkillFileContent =
  "---\nname: demo-skill\ndescription: Demo skill\n---\n\n# Demo\n\nUse this.";

const demoSkillReadResult = {
  content: "# Demo\n\nUse this.",
  description: "Demo skill",
  location: "skill://demo-skill/SKILL.md",
  name: "demo-skill",
  resources: [
    {
      mediaType: "text/markdown",
      path: "SKILL.md",
      sha256: "skill-md",
      size: 72,
    },
    {
      mediaType: 'text/markdown; charset="utf-8"',
      path: "references/demo.md",
      sha256: "abc",
      size: 12,
    },
  ],
  version: 2,
};

const demoSkillFileResource = {
  content: demoSkillFileContent,
  encoding: "text",
  mediaType: "text/markdown",
  path: "SKILL.md",
  sha256: "skill-md",
  size: 72,
  version: 2,
};

const formattedDemoSkill =
  '<skill>\n---\nname: demo-skill\ndescription: Demo skill\n---\n\n# Demo\n\nUse this.\n\n<resources>\n  <resource path="references/demo.md" uri="skill://demo-skill/references/demo.md" media_type="text/markdown; charset=&quot;utf-8&quot;" size="12" />\n</resources>\n</skill>';

describe("Skillpack Pi extension", () => {
  it("registers the read tool and injects a Skillpack catalog", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { handlers, pi, providers, tools } = createPiHarness();

    createSkillpackExtension({ client })(pi);

    expect(tools.has("skillpack_read")).toBeTruthy();
    expect(tools.has("skillpack_read_skill")).toBeFalsy();
    expect(tools.has("skillpack_read_resource")).toBeFalsy();
    expect(providers.has("skillpack")).toBeTruthy();

    const result = await handlers.get("before_agent_start")?.(
      { systemPrompt: "base" },
      {}
    );

    expect(result).toStrictEqual({
      systemPrompt: expect.stringContaining(
        "<location>skill://demo-skill/SKILL.md</location>"
      ),
    });
  });

  it("returns Pi-style skill content from a SKILL.md URI", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(),
      readResource: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve(demoSkillFileResource)
      ),
      readSkill: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve(demoSkillReadResult)
      ),
    } as unknown as SkillpackClient;
    const { pi, tools } = createPiHarness();

    createSkillpackExtension({ client })(pi);

    const result = await tools
      .get("skillpack_read")
      ?.execute(
        "tool-call-id",
        { location: "skill://demo-skill/SKILL.md" },
        undefined,
        undefined,
        {}
      );

    expect(client.readResource).toHaveBeenCalledWith(
      "skill://demo-skill/SKILL.md"
    );
    expect(result).toStrictEqual({
      content: [
        {
          text: formattedDemoSkill,
          type: "text",
        },
      ],
      details: {},
    });
  });

  it("reads attached resources from a full skill resource URI", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(),
      readResource: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve({
          content: "# Reference",
          encoding: "text",
          mediaType: "text/markdown",
          path: "references/demo.md",
          sha256: "abc",
          size: 12,
          version: 2,
        })
      ),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { pi, tools } = createPiHarness();

    createSkillpackExtension({ client })(pi);

    const result = await tools
      .get("skillpack_read")
      ?.execute(
        "tool-call-id",
        { location: "skill://demo-skill/references/demo.md" },
        undefined,
        undefined,
        {}
      );

    expect(client.readResource).toHaveBeenCalledWith(
      "skill://demo-skill/references/demo.md"
    );
    expect(client.readSkill).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      content: [
        {
          text: "# Reference",
          type: "text",
        },
      ],
      details: {},
    });
  });

  it("registers /skillpack to select a Skillpack skill and prefill the editor", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { commands, pi } = createPiHarness();
    const ctx = {
      isIdle: () => true,
      ui: {
        notify: vi.fn<(message: string, type?: string) => void>(),
        select: vi.fn<() => Promise<string | undefined>>(() =>
          Promise.resolve("demo-skill  skill://demo-skill/SKILL.md")
        ),
        setEditorText: vi.fn<(text: string) => void>(),
      },
    };

    createSkillpackExtension({ client })(pi);

    await commands.get("skillpack")?.handler("", ctx);

    expect(ctx.ui.setEditorText).toHaveBeenCalledWith("/skillpack:demo-skill ");
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("expands direct /skillpack:name input into full skill content and user prompt", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve(demoSkillFileResource)
      ),
      readSkill: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve(demoSkillReadResult)
      ),
    } as unknown as SkillpackClient;
    const { handlers, pi } = createPiHarness();
    const ctx = {
      ui: {
        notify: vi.fn<(message: string, type?: string) => void>(),
      },
    };

    createSkillpackExtension({ client })(pi);

    const result = await handlers.get("input")?.(
      {
        source: "interactive",
        text: "/skillpack:demo-skill do X",
        type: "input",
      },
      ctx
    );

    expect(client.readSkill).toHaveBeenCalledWith(
      "skill://demo-skill/SKILL.md"
    );
    expect(client.readResource).toHaveBeenCalledWith(
      "skill://demo-skill/SKILL.md"
    );
    expect(result).toStrictEqual({
      action: "transform",
      text: `${formattedDemoSkill}\n\ndo X`,
    });
  });

  it("handles unknown /skillpack:name input without sending raw slash text", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { handlers, pi } = createPiHarness();
    const ctx = {
      ui: {
        notify: vi.fn<(message: string, type?: string) => void>(),
      },
    };

    createSkillpackExtension({ client })(pi);

    const result = await handlers.get("input")?.(
      {
        source: "interactive",
        text: "/skillpack:missing do X",
        type: "input",
      },
      ctx
    );

    expect(result).toStrictEqual({ action: "handled" });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Unknown Skillpack skill: missing",
      "error"
    );
    expect(client.readSkill).not.toHaveBeenCalled();
  });

  it("skips extension-injected input to avoid recursive expansion", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { handlers, pi } = createPiHarness();

    createSkillpackExtension({ client })(pi);

    await expect(
      handlers.get("input")?.(
        {
          source: "extension",
          text: "/skillpack:demo-skill do X",
          type: "input",
        },
        { ui: { notify: vi.fn<(message: string, type?: string) => void>() } }
      )
    ).resolves.toStrictEqual({ action: "continue" });
    expect(client.listSkills).not.toHaveBeenCalled();
    expect(client.readSkill).not.toHaveBeenCalled();
  });

  it("handles readSkill failures without sending raw slash text", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(() =>
        Promise.reject(new Error("network down"))
      ),
    } as unknown as SkillpackClient;
    const { handlers, pi } = createPiHarness();
    const ctx = {
      ui: {
        notify: vi.fn<(message: string, type?: string) => void>(),
      },
    };

    createSkillpackExtension({ client })(pi);

    const result = await handlers.get("input")?.(
      {
        source: "interactive",
        text: "/skillpack:demo-skill do X",
        type: "input",
      },
      ctx
    );

    expect(result).toStrictEqual({ action: "handled" });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Failed to read Skillpack skill: network down",
      "error"
    );
  });

  it("completes /skillpack arguments from the Skillpack catalog", async () => {
    const client = {
      listSkills: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve([
          {
            description: "Demo skill",
            name: "demo-skill",
          },
        ])
      ),
      readResource: vi.fn<() => Promise<unknown>>(),
      readSkill: vi.fn<() => Promise<unknown>>(),
    } as unknown as SkillpackClient;
    const { commands, pi } = createPiHarness();

    createSkillpackExtension({ client })(pi);

    await expect(
      commands.get("skillpack")?.getArgumentCompletions?.("dem")
    ).resolves.toStrictEqual([
      {
        description: "Demo skill",
        label: "demo-skill",
        value: "demo-skill",
      },
    ]);
  });
});
