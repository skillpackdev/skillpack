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

  it("creates, updates, and reads a Skill through MCP against D1 and R2", async () => {
    const app = createApp({
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

    const createResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          content: "# Demo\n",
          description: "Demo skill",
          name: "mcp-demo",
          resources: [
            {
              content: "first note",
              path: "references/note.txt",
            },
          ],
        },
        name: "create_skill",
      }),
      env
    );

    expect(createResponse.status).toBe(200);

    const updateResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          skillName: "mcp-demo",
          upsertResources: [
            {
              content:
                "---\nname: mcp-demo\ndescription: Updated demo skill\n---\n\n# Demo\n\nUpdated by MCP.\n",
              path: "SKILL.md",
            },
            {
              content: "second note",
              path: "references/note.txt",
            },
          ],
        },
        name: "update_skill",
      }),
      env
    );

    expect(updateResponse.status).toBe(200);

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

    expect({
      hasUpdatedBody: readBody.includes("Updated by MCP"),
      hasUpdatedFrontmatter: readBody.includes(
        "description: Updated demo skill"
      ),
    }).toStrictEqual({
      hasUpdatedBody: true,
      hasUpdatedFrontmatter: true,
    });
    await expect(resourceResponse.text()).resolves.toContain("second note");

    const repository = new SkillRepository(createDb(env.DB), "user-e2e");
    const skill = await repository.findSkillByName("mcp-demo");
    const versions = await repository.listVersions("mcp-demo");

    expect({
      description: skill?.description,
      versionCount: versions.length,
    }).toStrictEqual({
      description: "Updated demo skill",
      versionCount: 2,
    });
  });
});
