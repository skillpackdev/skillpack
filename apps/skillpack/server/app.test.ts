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
      id: 42,
      license: null,
      metadata: null,
      name: "demo",
      origin: null,
      ownerUserId: "user-oauth",
      updatedAt: createdAt,
    },
  };
};

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
      scopes_supported: ["skills:read"],
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
      resource: "http://localhost/mcp",
      resource_name: "Skillpack MCP Server",
      scopes_supported: ["offline_access", "skills:read"],
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
      'Bearer realm="mcp", resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp", scope="openid offline_access skills:read"'
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
    await expect(response.json()).resolves.toMatchObject({
      id: 2,
      jsonrpc: "2.0",
      result: {
        tools: [
          expect.objectContaining({ name: "list_skills" }),
          expect.objectContaining({ name: "read_skill" }),
        ],
      },
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
          id: 42,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
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
                location: "skill://skillpack/demo-skill",
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
    const resolveSkillByName = vi
      .fn<SkillService["resolveSkillByName"]>()
      .mockResolvedValue({
        content: "# Demo\n\nUse this.",
        resources: [
          {
            createdAt,
            id: 1,
            mediaType: "text/markdown",
            path: "SKILL.md",
            sha256: "skill-md",
            size: 48,
            skillId: 42,
          },
          {
            createdAt,
            id: 2,
            mediaType: "text/markdown",
            path: "references/demo.md",
            sha256: "abc123",
            size: 12,
            skillId: 42,
          },
        ],
        skill: {
          allowedTools: null,
          compatibility: null,
          createdAt,
          description: "Demo skill",
          id: 42,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
          updatedAt: createdAt,
        },
      });
    const readSkillTextFileByName = vi
      .fn<SkillService["readSkillTextFileByName"]>()
      .mockResolvedValue({
        content: "---\nname: demo-skill\n---\n\n# Demo\n\nUse this.\n",
        resource: {
          mediaType: "text/markdown",
          path: "SKILL.md",
          sha256: "skill-md",
          size: 49,
        },
      } as Awaited<ReturnType<SkillService["readSkillTextFileByName"]>>);
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { readSkillTextFileByName, resolveSkillByName },
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
            arguments: { location: "skill://skillpack/demo-skill" },
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
        text: '<skill>\n---\nname: demo-skill\n---\n\n# Demo\n\nUse this.\n\n<resources>\n  <resource path="references/demo.md" media_type="text/markdown" size="12" />\n</resources>\n</skill>',
        type: "text",
      },
    ]);
    expect(resolveSkillByName).toHaveBeenCalledWith("demo-skill");
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "SKILL.md",
      skillName: "demo-skill",
    });
  });

  it("returns attached resources from read_skill with a path", async () => {
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
          id: 5,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              location: "skill://skillpack/demo-skill",
              path: "references/demo.md",
            },
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
      { text: "# Reference", type: "text" },
    ]);
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "references/demo.md",
      skillName: "demo-skill",
    });
  });

  it("rejects unsafe read_skill resource paths before service lookup", async () => {
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
          id: 11,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              location: "skill://skillpack/demo-skill",
              path: "../secret.md",
            },
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
    await expect(response.json()).resolves.toMatchObject({
      id: 11,
      jsonrpc: "2.0",
      result: {
        isError: true,
      },
    });
    expect(readSkillTextFileByName).not.toHaveBeenCalled();
  });

  it("lists Skillpack skills and attached resources as MCP resources", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const listSkills = vi.fn<SkillService["listSkills"]>().mockResolvedValue([
      {
        skill: {
          allowedTools: null,
          compatibility: null,
          createdAt,
          description: "Demo skill",
          id: 42,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
          updatedAt: createdAt,
        },
      },
    ] as Awaited<ReturnType<SkillService["listSkills"]>>);
    const resolveSkillByName = vi
      .fn<SkillService["resolveSkillByName"]>()
      .mockResolvedValue({
        ...resolvedSkill(),
        resources: [
          {
            createdAt,
            id: 1,
            mediaType: "text/markdown",
            path: "SKILL.md",
            sha256: "skill-md",
            size: 48,
            skillId: 42,
          },
          {
            createdAt,
            id: 2,
            mediaType: "text/markdown",
            path: "references/demo.md",
            sha256: "abc123",
            size: 12,
            skillId: 42,
          },
        ],
      });
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser(
        { listSkills, resolveSkillByName },
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
        resources: [
          expect.objectContaining({
            name: "demo-skill",
            uri: "skill://skillpack/demo-skill",
          }),
          expect.objectContaining({
            mimeType: "text/markdown",
            name: "demo-skill: references/demo.md",
            uri: "skillpack-resource://skillpack/demo-skill?path=references%2Fdemo.md",
          }),
        ],
      },
    });
    expect(listSkills).toHaveBeenCalledOnce();
    expect(resolveSkillByName).toHaveBeenCalledWith("demo-skill");
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
            uri: "skillpack-resource://skillpack/demo-skill?path=references%2Fdemo.md",
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
            uri: "skillpack-resource://skillpack/demo-skill?path=references%2Fdemo.md",
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
          params: { uri: "skill://skillpack/demo-skill" },
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
            uri: "skill://skillpack/demo-skill",
          },
        ],
      },
    });
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "SKILL.md",
      skillName: "demo-skill",
    });
  });

  it("serves a Skillpack prompt guide with the authenticated catalog", async () => {
    const createdAt = new Date("2026-05-25T12:00:00.000Z");
    const listSkills = vi.fn<SkillService["listSkills"]>().mockResolvedValue([
      {
        skill: {
          allowedTools: null,
          compatibility: null,
          createdAt,
          description: "Demo skill",
          id: 42,
          license: null,
          metadata: null,
          name: "demo-skill",
          origin: null,
          ownerUserId: "user-oauth",
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
          id: 9,
          jsonrpc: "2.0",
          method: "prompts/get",
          params: { name: "use_skillpack_skills" },
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
      id: 9,
      jsonrpc: "2.0",
      result: {
        messages: [
          {
            content: {
              text: expect.stringContaining(
                "<location>skill://skillpack/demo-skill</location>"
              ),
              type: "text",
            },
            role: "user",
          },
        ],
      },
    });
    expect(listSkills).toHaveBeenCalledOnce();
  });

  it("lists the Skillpack prompt guide", async () => {
    const app = createApp({
      getSkillReadBearerUserId: vi
        .fn<VerifySkillReadBearerUserId>()
        .mockResolvedValue("user-oauth"),
      setSkillServicesForUser: setSkillServicesForUser({}, []),
    });

    const response = await app.request(
      "/mcp",
      {
        body: JSON.stringify({
          id: 10,
          jsonrpc: "2.0",
          method: "prompts/list",
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
      id: 10,
      jsonrpc: "2.0",
      result: {
        prompts: [expect.objectContaining({ name: "use_skillpack_skills" })],
      },
    });
  });
});
