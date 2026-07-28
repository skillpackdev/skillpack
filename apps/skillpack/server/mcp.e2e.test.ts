import { createDb } from "@server/db/client";
import { applyFreshSchema } from "@server/test/migrations";
import type { AppBindings } from "@server/types";
import type { Context } from "hono";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { SkillRepository } from "./modules/skills/repository";
import { ResourceManifest } from "./modules/skills/resource-manifest";
import { SkillService } from "./modules/skills/service";

const apiKeySecret = `skp_${"a".repeat(40)}`;

const mcpRequest = (method: string, params?: unknown) => ({
  body: JSON.stringify({
    id: 1,
    jsonrpc: "2.0",
    method,
    params,
  }),
  headers: {
    accept: "application/json",
    authorization: `Bearer ${apiKeySecret}`,
    "content-type": "application/json",
  },
  method: "POST",
});

const parseToolResult = async (response: Response) => {
  const body = (await response.json()) as {
    result: { content: { text: string }[] };
  };

  return JSON.parse(body.result.content[0]?.text ?? "{}") as {
    action?: string;
    error?: { code: string; message: string };
    ok: boolean;
    skill?: { description: string; name: string };
  };
};

const createAuthoringApp = () =>
  createApp({
    getApiKeyUserId: vi
      .fn<() => Promise<string>>()
      .mockResolvedValue("user-e2e"),
    setSkillServicesForUser: (c: Context<AppBindings>, userId: string) => {
      c.set("currentUser", { canWrite: true, id: userId });
      c.set(
        "skillService",
        new SkillService(
          new SkillRepository(c.var.db, userId),
          new ResourceManifest(c.var.skillStorage),
          c.var.originService
        )
      );
    },
  });

describe("MCP Skill authoring e2e", () => {
  let env: Env;
  let mf: Miniflare;

  beforeEach(async () => {
    mf = new Miniflare({
      d1Databases: { DB: "skillpack-e2e" },
      modules: true,
      r2Buckets: ["BUCKET"],
      script: "export default { fetch: () => new Response('ok') };",
    });

    const db = (await mf.getD1Database("DB")) as unknown as D1Database;
    await applyFreshSchema(db);

    env = {
      BETTER_AUTH_SECRET: "test-secret",
      BUCKET: (await mf.getR2Bucket("BUCKET")) as unknown as R2Bucket,
      DB: db,
    } as Env;
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("creates, patches, edits, and writes files through manage_skill", async () => {
    const app = createAuthoringApp();

    const createResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          action: "create",
          content:
            "---\nname: mcp-demo\ndescription: Demo skill\n---\n\n# Demo\n",
          name: "mcp-demo",
        },
        name: "manage_skill",
      }),
      env
    );

    expect({
      createResult: await parseToolResult(createResponse),
      createStatus: createResponse.status,
    }).toMatchObject({
      createResult: {
        action: "create",
        ok: true,
        skill: {
          description: "Demo skill",
          name: "mcp-demo",
        },
      },
      createStatus: 200,
    });

    for (const request of [
      mcpRequest("tools/call", {
        arguments: {
          action: "write_file",
          file_content: "first note",
          file_path: "references/note.txt",
          name: "mcp-demo",
        },
        name: "manage_skill",
      }),
      mcpRequest("tools/call", {
        arguments: {
          action: "patch",
          name: "mcp-demo",
          new_string: "# Demo\n\nUpdated by MCP.\n",
          old_string: "# Demo\n",
        },
        name: "manage_skill",
      }),
      mcpRequest("tools/call", {
        arguments: {
          action: "edit",
          content:
            "---\nname: mcp-demo\ndescription: Updated demo skill\n---\n\n# Demo\n\nUpdated by MCP.\n",
          name: "mcp-demo",
        },
        name: "manage_skill",
      }),
    ]) {
      const response = await app.request("/mcp", request, env);
      expect(response.status).toBe(200);
    }

    const readResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: { name: "mcp-demo" },
        name: "read_skill",
      }),
      env
    );
    const resourceResponse = await app.request(
      "/mcp",
      mcpRequest("resources/read", {
        uri: "skill://mcp-demo/references/note.txt",
      }),
      env
    );
    const readBody = await readResponse.text();
    const repository = new SkillRepository(createDb(env.DB), "user-e2e");
    const skill = await repository.findSkillByName("mcp-demo");
    const versions = await repository.listVersions("mcp-demo");

    expect({
      description: skill?.description,
      hasUpdatedBody: readBody.includes("Updated by MCP"),
      hasUpdatedFrontmatter: readBody.includes(
        "description: Updated demo skill"
      ),
      resourceBody: await resourceResponse.text(),
      versionCount: versions.length,
    }).toStrictEqual({
      description: "Updated demo skill",
      hasUpdatedBody: true,
      hasUpdatedFrontmatter: true,
      resourceBody: expect.stringContaining("first note"),
      versionCount: 4,
    });
  });

  it("deletes a skill through manage_skill", async () => {
    const app = createAuthoringApp();

    await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          action: "create",
          content:
            "---\nname: mcp-delete\ndescription: Delete me\n---\n\n# Delete\n",
          name: "mcp-delete",
        },
        name: "manage_skill",
      }),
      env
    );

    const deleteResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          action: "delete",
          name: "mcp-delete",
        },
        name: "manage_skill",
      }),
      env
    );
    const repository = new SkillRepository(createDb(env.DB), "user-e2e");

    expect({
      deleteResult: await parseToolResult(deleteResponse),
      deleteStatus: deleteResponse.status,
      skill: await repository.findSkillByName("mcp-delete"),
    }).toMatchObject({
      deleteResult: {
        action: "delete",
        ok: true,
      },
      deleteStatus: 200,
      skill: undefined,
    });
  });
});
