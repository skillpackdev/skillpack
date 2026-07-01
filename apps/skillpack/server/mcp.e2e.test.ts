import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createDb } from "@server/db/client";
import type { AppBindings } from "@server/types";
import type { Context } from "hono";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import { SkillRepository } from "./modules/skills/repository";
import { ResourceManifest } from "./modules/skills/resource-manifest";
import { SkillService } from "./modules/skills/service";

const splitSqlStatements = (sql: string) =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

const applyMigration = async (db: D1Database, path: string) => {
  const sql = await readFile(path, "utf-8");

  for (const statement of splitSqlStatements(sql)) {
    await db.prepare(statement).run();
  }
};

const applyFreshSchema = async (db: D1Database) => {
  for (const migration of [
    "0000_initial.sql",
    "0001_better_auth_oauth_provider.sql",
    "0002_api_keys.sql",
    "0003_skill_version_history.sql",
  ]) {
    await applyMigration(db, join(process.cwd(), "migrations", migration));
  }
};

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
        const repository = new SkillRepository(c.var.db, userId);
        c.set("skillRepository", repository);
        c.set(
          "skillService",
          new SkillService(
            repository,
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
        arguments: { location: "skill://skillpack/mcp-demo" },
        name: "read_skill",
      }),
      env
    );
    const resourceResponse = await app.request(
      "/mcp",
      mcpRequest("tools/call", {
        arguments: {
          location: "skill://skillpack/mcp-demo",
          path: "references/note.txt",
        },
        name: "read_skill",
      }),
      env
    );

    await expect(readResponse.text()).resolves.toContain("Updated by MCP");
    await expect(resourceResponse.text()).resolves.toContain("second note");

    const repository = new SkillRepository(createDb(env.DB), "user-e2e");
    const skill = await repository.findSkillByName("mcp-demo");
    const versionResources = await repository.listVersionResources(
      skill?.pk ?? 0
    );

    expect({
      description: skill?.description,
      versionResourceCount: versionResources.length,
    }).toStrictEqual({
      description: "Updated demo skill",
      versionResourceCount: 4,
    });
  });
});
