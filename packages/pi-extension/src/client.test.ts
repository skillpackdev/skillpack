import { describe, expect, it, vi } from "vitest";

import { SkillpackClient } from "./client";

describe(SkillpackClient, () => {
  it("reads a Skillpack Managed Skill with Bearer auth", async () => {
    const fetch = vi.fn<
      (input: string | URL, init?: RequestInit) => Promise<Response>
    >((input, init) => {
      expect(String(input)).toBe(
        "https://skillpack.example/api/v1/skills/demo-skill"
      );
      expect(init?.headers).toMatchObject({
        authorization: "Bearer access-token",
      });

      return Promise.resolve(
        Response.json(
          {
            allowedTools: null,
            compatibility: null,
            content: "# Demo\n\nUse this.",
            createdAt: "2026-05-27T00:00:00.000Z",
            description: "Demo skill",
            license: null,
            metadata: null,
            name: "demo-skill",
            resources: [
              {
                mediaType: "text/markdown; charset=utf-8",
                path: "references/demo.md",
                sha256: "abc",
                size: 12,
              },
            ],
            updatedAt: "2026-05-27T00:00:00.000Z",
          },
          { status: 200 }
        )
      );
    });
    const client = new SkillpackClient({
      fetch,
      getAccessToken: () => Promise.resolve("access-token"),
      getBaseUrl: () => Promise.resolve("https://skillpack.example"),
    });

    await expect(
      client.readSkill("skill://demo-skill/SKILL.md")
    ).resolves.toMatchObject({
      content: "# Demo\n\nUse this.",
      location: "skill://demo-skill/SKILL.md",
      name: "demo-skill",
      resources: [{ path: "references/demo.md" }],
    });
  });

  it("reads text resources through the JSON resource endpoint", async () => {
    const fetch = vi.fn<() => Promise<Response>>(() =>
      Promise.resolve(
        Response.json({
          content: "# Reference",
          mediaType: "text/markdown; charset=utf-8",
          path: "references/demo.md",
          sha256: "abc",
          size: 11,
        })
      )
    );
    const client = new SkillpackClient({
      fetch,
      getAccessToken: () => Promise.resolve("access-token"),
      getBaseUrl: () => Promise.resolve("https://skillpack.example/"),
    });

    await expect(
      client.readResource("skill://demo-skill/references/demo.md")
    ).resolves.toStrictEqual({
      content: "# Reference",
      encoding: "text",
      mediaType: "text/markdown; charset=utf-8",
      path: "references/demo.md",
      sha256: "abc",
      size: 11,
    });
  });

  it("reads binary resources through the raw resource endpoint", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetch = vi.fn<() => Promise<Response>>(() => {
      const headers = new Headers({
        "content-type": "image/png",
        "x-skill-resource-sha256": "abc",
        "x-skill-version": "3",
      });
      return Promise.resolve(new Response(bytes, { headers, status: 200 }));
    });
    const client = new SkillpackClient({
      fetch,
      getAccessToken: () => Promise.resolve("access-token"),
      getBaseUrl: () => Promise.resolve("https://skillpack.example/"),
    });

    await expect(
      client.readResource("skill://demo-skill/assets/logo.png")
    ).resolves.toStrictEqual({
      content: "AQID",
      encoding: "base64",
      mediaType: "image/png",
      path: "assets/logo.png",
      sha256: "abc",
      size: 3,
    });
  });
});
