import type { AppBindings } from "@server/types";
import type { Context } from "hono";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";
import type { SkillService } from "./modules/skills/service";
import type { ResolvedSkillResult } from "./modules/skills/types";

type VerifySkillReadBearerUserId = NonNullable<
  NonNullable<Parameters<typeof createApp>[0]>["getSkillReadBearerUserId"]
>;
type VerifyApiKeyUserId = NonNullable<
  NonNullable<Parameters<typeof createApp>[0]>["getApiKeyUserId"]
>;

const testEnv = {
  BETTER_AUTH_SECRET: "test-secret",
  BUCKET: {},
  DB: {},
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
  OIDC_CLIENT_ID: "oidc-client",
  OIDC_DISCOVERY_URL: "https://issuer.example/.well-known/openid-configuration",
} as Env;

const setSkillServicesForUser =
  (skillService: Partial<SkillService>, seenUserIds: string[]) =>
  (c: Context<AppBindings>, userId: string) => {
    seenUserIds.push(userId);
    c.set("currentUser", { id: userId });
    c.set("skillService", skillService as SkillService);
  };

const resolvedSkill = (): ResolvedSkillResult => {
  const createdAt = new Date("2026-05-25T12:00:00.000Z");

  return {
    content: "# Demo\n",
    resources: [],
    skill: {
      allowedTools: null,
      compatibility: null,
      createdAt,
      description: "Demo description",
      frontmatter: null,
      headVersionPk: 10,
      license: null,
      metadata: null,
      name: "demo",
      origin: null,
      ownerUserId: "user-oauth",
      pk: 42,
      skillFileSha256: "skill-md",
      skillFileSize: 120,
      updatedAt: createdAt,
      versionId: "version-current",
    },
  };
};

describe("app auth coverage on collection routes", () => {
  // Regression guard: `.use("/api/v1/<x>/*")` must also match the exact
  // collection path, so unauthenticated list/create requests get 401.
  it.each([
    ["GET", "/api/v1/skills"],
    ["POST", "/api/v1/skills"],
    ["GET", "/api/v1/api-keys"],
    ["GET", "/api/v1/origins"],
  ])("rejects unauthenticated %s %s", async (method, path) => {
    const app = createApp();

    const response = await app.request(path, { method }, testEnv);

    expect(response.status).toBe(401);
  });
});

describe("app login provider discovery", () => {
  it("reports GitHub and OIDC when both provider configs are present", async () => {
    const app = createApp();

    const response = await app.request(
      "/api/auth/login-providers",
      undefined,
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      github: true,
      oidc: true,
    });
  });

  it("keeps OIDC optional when its provider config is absent", async () => {
    const app = createApp();

    const response = await app.request("/api/auth/login-providers", undefined, {
      ...testEnv,
      OIDC_CLIENT_ID: undefined,
      OIDC_DISCOVERY_URL: undefined,
    } as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      github: true,
      oidc: false,
    });
  });
});

describe("app OAuth bearer skills read auth", () => {
  it("serves protected resource metadata for skill reads", async () => {
    const app = createApp();

    const response = await app.request(
      "/.well-known/oauth-protected-resource",
      undefined,
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: ["http://localhost"],
      bearer_methods_supported: ["header"],
      resource: "http://localhost",
      resource_name: "Skillpack Managed Skills",
      scopes_supported: ["skills:read", "skills:write"],
    });
  });

  it("allows bearer tokens with skills:read to list skills", async () => {
    const seenUserIds: string[] = [];
    const listSkills = vi
      .fn<SkillService["listSkills"]>()
      .mockResolvedValue([]);
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser(
        { listSkills },
        seenUserIds
      ),
    });

    const response = await app.request(
      "/api/v1/skills",
      { headers: { authorization: "Bearer access-token" } },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ skills: [] });
    expect(getSkillReadBearerUserId).toHaveBeenCalledOnce();
    expect(listSkills).toHaveBeenCalledOnce();
    expect(seenUserIds).toStrictEqual(["user-oauth"]);
  });

  it("allows bearer tokens with skills:read to read skill resources", async () => {
    const seenUserIds: string[] = [];
    const readSkillTextFileByName =
      vi.fn<SkillService["readSkillTextFileByName"]>();
    readSkillTextFileByName.mockResolvedValue({
      content: "resource body",
      resource: {
        mediaType: "text/markdown",
        path: "notes.md",
        sha256: "abc123",
        size: 13,
      },
    } as Awaited<ReturnType<SkillService["readSkillTextFileByName"]>>);
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillTextFileByName },
        seenUserIds
      ),
    });

    const response = await app.request(
      "/api/v1/skills/demo-skill/resources?path=notes.md",
      { headers: { authorization: "Bearer access-token" } },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      content: "resource body",
      mediaType: "text/markdown",
      path: "notes.md",
      sha256: "abc123",
      size: 13,
    });
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "notes.md",
      skillName: "demo-skill",
    });
    expect(seenUserIds).toStrictEqual(["user-oauth"]);
  });

  it("allows bearer tokens with skills:read to resolve skills by name", async () => {
    const seenUserIds: string[] = [];
    const resolveSkillByName = vi
      .fn<SkillService["resolveSkillByName"]>()
      .mockResolvedValue(resolvedSkill());
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser(
        { resolveSkillByName },
        seenUserIds
      ),
    });

    const response = await app.request(
      "/api/v1/skills/demo",
      { headers: { authorization: "Bearer access-token" } },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "demo",
    });
    expect(resolveSkillByName).toHaveBeenCalledWith("demo");
    expect(seenUserIds).toStrictEqual(["user-oauth"]);
  });

  it("rejects bearer tokens on Skill Version History routes", async () => {
    const listVersionHistory = vi.fn<SkillService["listVersionHistory"]>();
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser(
        { listVersionHistory },
        []
      ),
    });

    const response = await app.request(
      "/api/v1/skills/demo/versions",
      { headers: { authorization: "Bearer access-token" } },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(getSkillReadBearerUserId).not.toHaveBeenCalled();
    expect(listVersionHistory).not.toHaveBeenCalled();
  });

  it("rejects bearer tokens on skills write routes", async () => {
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({ getSkillReadBearerUserId });

    const response = await app.request(
      "/api/v1/skills",
      {
        body: JSON.stringify({ content: "# Demo", name: "demo" }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(getSkillReadBearerUserId).not.toHaveBeenCalled();
  });
});

describe("app MCP auth", () => {
  const initializeRequest = {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
      protocolVersion: "2025-11-25",
    },
  };

  it("serves MCP protected resource metadata", async () => {
    const app = createApp();

    const response = await app.request(
      "/.well-known/oauth-protected-resource/mcp",
      undefined,
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_servers: ["http://localhost"],
      bearer_methods_supported: ["header"],
      resource: "http://localhost",
      resource_name: "Skillpack MCP Server",
      scopes_supported: ["offline_access", "skills:read", "skills:write"],
    });
  });

  it("challenges unauthenticated MCP requests with Skillpack OAuth metadata", async () => {
    const app = createApp();

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="mcp", resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp", scope="openid offline_access skills:read skills:write"'
    );
    await expect(response.json()).resolves.toStrictEqual({
      error: "Unauthorized",
    });
  });

  it("rejects non-POST MCP requests", async () => {
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({ getSkillReadBearerUserId });

    for (const method of ["GET", "DELETE"] as const) {
      const response = await app.request(
        "/mcp",
        {
          headers: { authorization: "Bearer access-token" },
          method,
        },
        testEnv
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect(getSkillReadBearerUserId).toHaveBeenCalledTimes(2);
  });

  it("allows bearer tokens with skills:read to initialize MCP", async () => {
    const seenUserIds: string[] = [];
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser({}, seenUserIds),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/skills": {},
          },
        },
        serverInfo: { name: "skillpack-mcp" },
      },
    });
    expect(getSkillReadBearerUserId).toHaveBeenCalledOnce();
    expect(seenUserIds).toStrictEqual(["user-oauth"]);
  });

  it("allows API keys to initialize MCP", async () => {
    const seenUserIds: string[] = [];
    const getApiKeyUserId = vi
      .fn<VerifyApiKeyUserId>()
      .mockResolvedValue("user-api-key");
    const getSkillReadBearerUserId = vi.fn<VerifySkillReadBearerUserId>();
    const app = createApp({
      getApiKeyUserId,
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser({}, seenUserIds),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer skp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 1,
      jsonrpc: "2.0",
      result: {
        capabilities: {
          extensions: {
            "io.modelcontextprotocol/skills": {},
          },
        },
        serverInfo: { name: "skillpack-mcp" },
      },
    });
    expect(getApiKeyUserId).toHaveBeenCalledWith(
      "skp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    expect(getSkillReadBearerUserId).not.toHaveBeenCalled();
    expect(seenUserIds).toStrictEqual(["user-api-key"]);
  });

  it("rejects API keys when verification fails", async () => {
    const getApiKeyUserId = vi.fn<VerifyApiKeyUserId>();
    const getSkillReadBearerUserId = vi.fn<VerifySkillReadBearerUserId>();
    const app = createApp({ getApiKeyUserId, getSkillReadBearerUserId });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer skp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'Bearer realm="mcp"'
    );
    expect(getApiKeyUserId).toHaveBeenCalledWith(
      "skp_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
    );
    expect(getSkillReadBearerUserId).not.toHaveBeenCalled();
  });

  it("does not allow API keys to manage API keys", async () => {
    const getApiKeyUserId = vi
      .fn<VerifyApiKeyUserId>()
      .mockResolvedValue("user-api-key");
    const app = createApp({ getApiKeyUserId });

    const response = await app.request(
      "/api/v1/api-keys",
      { headers: { authorization: "Bearer skp_test_api_key" } },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(getApiKeyUserId).not.toHaveBeenCalled();
  });

  it("does not allow API keys to call REST skill APIs", async () => {
    const getApiKeyUserId = vi
      .fn<VerifyApiKeyUserId>()
      .mockResolvedValue("user-api-key");
    const getSkillReadBearerUserId = vi.fn<VerifySkillReadBearerUserId>();
    const app = createApp({ getApiKeyUserId, getSkillReadBearerUserId });

    const response = await app.request(
      "/api/v1/skills",
      { headers: { authorization: "Bearer skp_test_api_key" } },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(getApiKeyUserId).not.toHaveBeenCalled();
    expect(getSkillReadBearerUserId).toHaveBeenCalledOnce();
  });

  it("rejects MCP requests when bearer verification fails", async () => {
    const getSkillReadBearerUserId = vi.fn<VerifySkillReadBearerUserId>();
    const app = createApp({ getSkillReadBearerUserId });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer bad-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'Bearer realm="mcp"'
    );
    expect(getSkillReadBearerUserId).toHaveBeenCalledOnce();
  });

  it("allows MCP requests from the same browser origin", async () => {
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser({}, []),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
          origin: "http://localhost",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    expect(getSkillReadBearerUserId).toHaveBeenCalledOnce();
  });

  it("rejects MCP requests from unexpected browser origins", async () => {
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({ getSkillReadBearerUserId });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify(initializeRequest),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Forbidden",
    });
    expect(getSkillReadBearerUserId).not.toHaveBeenCalled();
  });

  it("lists Skillpack MCP tools for authenticated agents", async () => {
    const getSkillReadBearerUserId = vi
      .fn<VerifySkillReadBearerUserId>()
      .mockResolvedValue("user-oauth");
    const app = createApp({
      getSkillReadBearerUserId,
      setSkillServicesForUser: setSkillServicesForUser({}, []),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 2,
          jsonrpc: "2.0",
          method: "tools/list",
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: {
        tools: {
          inputSchema: { properties: Record<string, unknown> };
          name: string;
        }[];
      };
    };
    const readSkillTool = body.result.tools.find(
      (tool) => tool.name === "read_skill"
    );
    const updateSkillTool = body.result.tools.find(
      (tool) => tool.name === "update_skill"
    );

    expect(body).toMatchObject({
      id: 2,
      jsonrpc: "2.0",
      result: {
        tools: [
          expect.objectContaining({ name: "list_skills" }),
          expect.objectContaining({ name: "create_skill" }),
          expect.objectContaining({ name: "update_skill" }),
          expect.objectContaining({ name: "read_skill" }),
        ],
      },
    });
    const toolNames = body.result.tools.map((tool) => tool.name);
    toolNames.sort();
    expect(toolNames).toStrictEqual([
      "create_skill",
      "list_skills",
      "read_skill",
      "update_skill",
    ]);
    expect({
      hasUpdateContent: Object.hasOwn(
        updateSkillTool?.inputSchema.properties ?? {},
        "content"
      ),
      readSkillInputKeys: Object.keys(
        readSkillTool?.inputSchema.properties ?? {}
      ),
    }).toStrictEqual({
      hasUpdateContent: false,
      readSkillInputKeys: ["name"],
    });
  });

  it("returns the authenticated Skillpack catalog from list_skills", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const listSkills = vi.fn<SkillService["listSkills"]>().mockResolvedValue([
      {
        skill: {
          allowedTools: null,
          compatibility: null,
          createdAt,
          description: "Demo skill",
          frontmatter: null,
          headVersionPk: 10,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
          pk: 42,
          skillFileSha256: "skill-md",
          skillFileSize: 120,
          updatedAt: createdAt,
        },
      },
    ] as Awaited<ReturnType<SkillService["listSkills"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser({ listSkills }, []),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: {}, name: "list_skills" },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { content: { text: string; type: string }[] };
    };
    expect(body.result.content).toStrictEqual([
      {
        text: JSON.stringify(
          {
            skills: [
              {
                description: "Demo skill",
                location: "skill://demo-skill/SKILL.md",
                name: "demo-skill",
              },
            ],
          },
          null,
          2
        ),
        type: "text",
      },
    ]);
    expect(listSkills).toHaveBeenCalledOnce();
  });

  it("returns a Skillpack activation payload from read_skill", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const readSkillTextFileByName =
      vi.fn<SkillService["readSkillTextFileByName"]>();
    const readSkillActivationByName = vi
      .fn<SkillService["readSkillActivationByName"]>()
      .mockResolvedValue({
        resources: [
          {
            createdAt,
            mediaType: "text/markdown",
            path: "references/demo.md",
            sha256: "abc123",
            size: 12,
            skillPk: 42,
            versionPk: 10,
          },
        ],
        skill: {
          allowedTools: null,
          compatibility: null,
          createdAt,
          description: "Demo skill",
          frontmatter: null,
          headVersionPk: 10,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
          pk: 42,
          skillFileSha256: "skill-md",
          skillFileSize: 120,
          updatedAt: createdAt,
          versionId: "version-current",
        },
        skillFileContent:
          "---\nname: demo-skill\ndescription: Demo skill\n---\n\n# Demo\n\nUse this.\n",
      });
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillActivationByName, readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 4,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: { name: "demo-skill" },
            name: "read_skill",
          },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { content: { text: string; type: string }[] };
    };
    expect(body.result.content).toStrictEqual([
      {
        text: '<skill>\n---\nname: demo-skill\ndescription: Demo skill\n---\n\n# Demo\n\nUse this.\n\n<resources>\n  <resource path="references/demo.md" uri="skill://demo-skill/references/demo.md" media_type="text/markdown" size="12" />\n</resources>\n</skill>',
        type: "text",
      },
    ]);
    expect(readSkillActivationByName).toHaveBeenCalledWith("demo-skill");
    expect(readSkillTextFileByName).not.toHaveBeenCalled();
  });

  it("keeps explicit null fields when update_skill also uploads SKILL.md", async () => {
    const patchSkillByName = vi
      .fn<SkillService["patchSkillByName"]>()
      .mockResolvedValue({
        allowedTools: null,
        compatibility: null,
        description: "Uploaded description",
        license: null,
        metadata: null,
        name: "demo-skill",
      });
    const app = createApp({
      getApiKeyUserId: vi
        .fn<VerifyApiKeyUserId>()
        .mockResolvedValue("user-api-key"),
      setSkillServicesForUser: setSkillServicesForUser(
        { patchSkillByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 15,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              license: null,
              metadata: null,
              skillName: "demo-skill",
              upsertResources: [
                {
                  content:
                    "---\nname: demo-skill\ndescription: Uploaded description\nlicense: Apache-2.0\nmetadata:\n  author: acme\n---\n\n# Demo\n",
                  path: "SKILL.md",
                },
              ],
            },
            name: "update_skill",
          },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer skp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    expect(patchSkillByName).toHaveBeenCalledWith(
      "demo-skill",
      expect.objectContaining({
        description: "Uploaded description",
        license: null,
        metadata: null,
      })
    );
  });

  it("rejects descendant SKILL.md resource URIs before service lookup", async () => {
    const readSkillTextFileByName =
      vi.fn<SkillService["readSkillTextFileByName"]>();
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 14,
          jsonrpc: "2.0",
          method: "resources/read",
          params: { uri: "skill://demo-skill/references/SKILL.md" },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: -32_602,
      },
      id: 14,
      jsonrpc: "2.0",
    });
    expect(readSkillTextFileByName).not.toHaveBeenCalled();
  });

  it("lists Skillpack skills and attached resources as MCP resources", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const readSkillTextFileByName =
      vi.fn<SkillService["readSkillTextFileByName"]>();
    const listSkillsWithCurrentResources = vi
      .fn<SkillService["listSkillsWithCurrentResources"]>()
      .mockResolvedValue([
        {
          resources: [
            {
              createdAt,
              mediaType: "text/markdown",
              path: "SKILL.md",
              sha256: "skill-md",
              size: 48,
              skillPk: 42,
              versionPk: 10,
            },
            {
              createdAt,
              mediaType: "text/markdown",
              path: "references/demo.md",
              sha256: "abc123",
              size: 12,
              skillPk: 42,
              versionPk: 10,
            },
          ],
          skill: {
            allowedTools: null,
            compatibility: null,
            createdAt,
            description: "Demo skill",
            frontmatter: null,
            headVersionPk: 10,
            license: null,
            metadata: null,
            name: "demo-skill",
            origin: null,
            ownerUserId: "user-oauth",
            pk: 42,
            skillFileSha256: "skill-md",
            skillFileSize: 120,
            updatedAt: createdAt,
            versionId: "version-current",
          },
        },
      ] as Awaited<ReturnType<SkillService["listSkillsWithCurrentResources"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { listSkillsWithCurrentResources, readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 6,
          jsonrpc: "2.0",
          method: "resources/list",
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 6,
      jsonrpc: "2.0",
      result: {
        resources: expect.arrayContaining([
          expect.objectContaining({
            mimeType: "application/json",
            name: "index.json",
            uri: "skill://index.json",
          }),
          expect.objectContaining({
            name: "demo-skill",
            uri: "skill://demo-skill/SKILL.md",
          }),
          expect.objectContaining({
            mimeType: "text/markdown",
            name: "demo-skill: references/demo.md",
            uri: "skill://demo-skill/references/demo.md",
          }),
        ]),
      },
    });
    expect(listSkillsWithCurrentResources).toHaveBeenCalledOnce();
    expect(readSkillTextFileByName).not.toHaveBeenCalled();
  });

  it("reads the SEP-2640 skill index resource", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const readSkillTextFileByName =
      vi.fn<SkillService["readSkillTextFileByName"]>();
    const listSkillsWithCurrentSkillFile = vi
      .fn<SkillService["listSkillsWithCurrentSkillFile"]>()
      .mockResolvedValue([
        {
          resource: {
            createdAt,
            mediaType: "text/markdown",
            path: "SKILL.md",
            sha256: "skill-md-sha256",
            size: 83,
            skillPk: 42,
            versionPk: 10,
          },
          skill: {
            allowedTools: null,
            compatibility: null,
            createdAt,
            description: "Demo skill",
            frontmatter: { references: ["docs/guide.md"] },
            headVersionPk: 10,
            license: null,
            metadata: { owner: "team-a" },
            name: "demo-skill",
            origin: null,
            ownerUserId: "user-oauth",
            pk: 42,
            skillFileSha256: "skill-md",
            skillFileSize: 120,
            updatedAt: createdAt,
            versionId: "version-current",
          },
        },
      ] as Awaited<ReturnType<SkillService["listSkillsWithCurrentSkillFile"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { listSkillsWithCurrentSkillFile, readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 12,
          jsonrpc: "2.0",
          method: "resources/read",
          params: { uri: "skill://index.json" },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      result: { contents: { text: string }[] };
    };
    expect(JSON.parse(body.result.contents[0]?.text ?? "{}")).toStrictEqual({
      skills: [
        {
          digest: "sha256:skill-md-sha256",
          frontmatter: {
            description: "Demo skill",
            metadata: { owner: "team-a" },
            name: "demo-skill",
            references: ["docs/guide.md"],
          },
          url: "skill://demo-skill/SKILL.md",
        },
      ],
    });
    expect(listSkillsWithCurrentSkillFile).toHaveBeenCalledOnce();
    expect(readSkillTextFileByName).not.toHaveBeenCalled();
  });

  it("reads attached Skillpack MCP resources by URI", async () => {
    const readSkillTextFileByName = vi
      .fn<SkillService["readSkillTextFileByName"]>()
      .mockResolvedValue({
        content: "# Reference",
        resource: {
          mediaType: "text/markdown",
          path: "references/demo.md",
          sha256: "abc123",
          size: 11,
        },
      } as Awaited<ReturnType<SkillService["readSkillTextFileByName"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 7,
          jsonrpc: "2.0",
          method: "resources/read",
          params: {
            uri: "skill://demo-skill/references/demo.md",
          },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 7,
      jsonrpc: "2.0",
      result: {
        contents: [
          {
            mimeType: "text/markdown",
            text: "# Reference",
            uri: "skill://demo-skill/references/demo.md",
          },
        ],
      },
    });
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "references/demo.md",
      skillName: "demo-skill",
    });
  });

  it("reads Skillpack skill resources by skill URI", async () => {
    const readSkillTextFileByName = vi
      .fn<SkillService["readSkillTextFileByName"]>()
      .mockResolvedValue({
        content: "---\nname: demo-skill\n---\n\n# Demo",
        resource: {
          mediaType: "text/markdown",
          path: "SKILL.md",
          sha256: "skill-md",
          size: 34,
        },
      } as Awaited<ReturnType<SkillService["readSkillTextFileByName"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillTextFileByName },
        []
      ),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 8,
          jsonrpc: "2.0",
          method: "resources/read",
          params: { uri: "skill://demo-skill/SKILL.md" },
        }),
        headers: {
          accept: "application/json",
          authorization: "Bearer access-token",
          "content-type": "application/json",
        },
        method: "POST",
      },
      testEnv
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 8,
      jsonrpc: "2.0",
      result: {
        contents: [
          {
            mimeType: "text/markdown",
            text: "---\nname: demo-skill\n---\n\n# Demo",
            uri: "skill://demo-skill/SKILL.md",
          },
        ],
      },
    });
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "SKILL.md",
      skillName: "demo-skill",
    });
  });
});
