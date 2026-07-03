import { setTimeout as sleep } from "node:timers/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGitHubRetrieval,
  createGitHubTransport,
} from "./github-retrieval";
import type { GitHubTransport, GitHubTreeEntry } from "./github-retrieval";

const origin = {
  kind: "github" as const,
  repoUrl: "https://github.com/acme/skills",
};

const skillContent = (name: string, description = "A useful skill") => `---
name: ${name}
description: ${description}
---

# ${name}
`;

const treeEntry = (path: string, size = 1): GitHubTreeEntry => ({
  path,
  sha: path,
  size,
  type: "blob",
});

const createTransport = (
  tree: GitHubTreeEntry[],
  files: Record<string, string>
) => {
  const transport = {
    getBlobText: vi
      .fn<GitHubTransport["getBlobText"]>()
      .mockImplementation((_owner, _repo, blobSha) => {
        const content = files[blobSha];

        if (content === undefined) {
          throw new Error(`Missing fixture for ${blobSha}`);
        }

        return Promise.resolve(content);
      }),
    getCommit: vi.fn<GitHubTransport["getCommit"]>().mockResolvedValue({
      commit: { tree: { sha: "tree-sha" } },
      sha: "commit-sha",
    }),
    getRepository: vi.fn<GitHubTransport["getRepository"]>().mockResolvedValue({
      default_branch: "main",
    }),
    getTree: vi.fn<GitHubTransport["getTree"]>().mockResolvedValue({ tree }),
  };

  return transport;
};

const stubGitHubApiFetch = () => {
  const requests: Request[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((request: Request) => {
      requests.push(request);
      return Promise.resolve(
        Response.json({
          default_branch: "main",
        })
      );
    })
  );

  return requests;
};

describe("GitHub Origin retrieval", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends OAuth App client credentials on API requests when configured", async () => {
    const requests = stubGitHubApiFetch();
    const transport = createGitHubTransport({
      githubClientId: " client-id ",
      githubClientSecret: " client-secret ",
    });

    await transport.getRepository("acme", "skills");

    expect(requests).toHaveLength(1);
    expect(requests.at(0)?.headers.get("authorization")).toBe(
      "Basic Y2xpZW50LWlkOmNsaWVudC1zZWNyZXQ="
    );
  });

  it("omits authorization on API requests without OAuth App credentials", async () => {
    const requests = stubGitHubApiFetch();
    const transport = createGitHubTransport({});

    await transport.getRepository("acme", "skills");

    expect(requests).toHaveLength(1);
    expect(requests.at(0)?.headers.has("authorization")).toBeFalsy();
  });

  it("rejects partial OAuth App credentials", () => {
    expect(() =>
      createGitHubTransport({ githubClientId: "client-id" })
    ).toThrow("Both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required");
  });

  it("reads blob text through the GitHub REST API", async () => {
    const requests: Request[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) => {
        requests.push(request);
        return Promise.resolve(
          Response.json({
            content: btoa("hello"),
            encoding: "base64",
          })
        );
      })
    );

    const transport = createGitHubTransport();

    await expect(
      transport.getBlobText("acme", "skills", "blob-sha")
    ).resolves.toBe("hello");

    expect(requests).toHaveLength(1);
    expect(new URL(requests[0].url).pathname).toBe(
      "/repos/acme/skills/git/blobs/blob-sha"
    );
  });

  it("discovers candidates in Skillpack priority order without reading blobs", async () => {
    const transport = createTransport(
      [
        treeEntry(".codex/skills/codex/SKILL.md"),
        treeEntry("skills/.system/system/SKILL.md"),
        treeEntry("skills/core/SKILL.md"),
        treeEntry("SKILL.md"),
        treeEntry("random/SKILL.md"),
        treeEntry(".agents/skills/agent/SKILL.md"),
      ],
      {}
    );
    const retrieval = createGitHubRetrieval(transport);

    const result = await retrieval.discover(origin);

    expect(result.candidates.map((candidate) => candidate.name)).toStrictEqual([
      "skills",
      "core",
      "system",
      "agent",
      "codex",
    ]);
    expect(result.resolvedOrigin).toStrictEqual({
      branch: "main",
      kind: "github",
      repoUrl: origin.repoUrl,
      rev: "commit-sha",
    });
    expect(transport.getBlobText).not.toHaveBeenCalled();
  });

  it("surfaces GitHub response messages when discovery fails", async () => {
    const transport = createTransport([], {});
    const error = new Error("Forbidden") as Error & { response: Response };
    error.response = Response.json(
      { message: "API rate limit exceeded" },
      { status: 403 }
    );
    transport.getRepository.mockRejectedValue(error);
    const retrieval = createGitHubRetrieval(transport);

    await expect(retrieval.discover(origin)).rejects.toMatchObject({
      message: "GitHub request failed: API rate limit exceeded",
    });
  });

  it("uses fallback discovery when priority roots are empty", async () => {
    const transport = createTransport(
      [
        treeEntry("docs/reference/deep-skill/SKILL.md"),
        treeEntry("a/b/c/d/e/f/SKILL.md"),
      ],
      {}
    );
    const retrieval = createGitHubRetrieval(transport);

    const result = await retrieval.discover(origin);

    expect(result.candidates.map((candidate) => candidate.path)).toStrictEqual([
      "docs/reference/deep-skill/SKILL.md",
    ]);
  });

  it("keeps the first candidate when path-derived names duplicate", async () => {
    const transport = createTransport(
      [
        treeEntry("skills/demo/SKILL.md"),
        treeEntry(".agents/skills/demo/SKILL.md"),
      ],
      {}
    );
    const retrieval = createGitHubRetrieval(transport);

    const result = await retrieval.discover(origin);

    expect(result.candidates).toStrictEqual([
      {
        name: "demo",
        path: "skills/demo/SKILL.md",
        selection: { skillName: "demo" },
      },
    ]);
  });

  it("assembles a selected definition from frontmatter, resources, and provenance", async () => {
    const transport = createTransport(
      [
        treeEntry("skills/folder-name/SKILL.md"),
        treeEntry("skills/folder-name/references/notes.txt"),
        treeEntry("skills/folder-name/scripts/run.ts"),
      ],
      {
        "skills/folder-name/SKILL.md": skillContent(
          "frontmatter-name",
          "From frontmatter"
        ),
        "skills/folder-name/references/notes.txt": "notes",
        "skills/folder-name/scripts/run.ts": "export {};",
      }
    );
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "folder-name" },
    ]);

    expect(result).toStrictEqual({
      definition: {
        allowedTools: null,
        compatibility: null,
        content: skillContent("frontmatter-name", "From frontmatter"),
        description: "From frontmatter",
        license: null,
        metadata: null,
        name: "frontmatter-name",
        provenance: {
          kind: "github",
          metadata: {
            branch: "main",
            resolvedSkillPath: "skills/folder-name/SKILL.md",
            rev: "commit-sha",
          },
          url: origin.repoUrl,
        },
        resources: [
          { content: "notes", path: "references/notes.txt" },
          { content: "export {};", path: "scripts/run.ts" },
        ],
        selection: { skillName: "folder-name" },
      },
      status: "resolved",
    });
  });

  it("reads selected definitions through GitHub blob shas", async () => {
    const tree = [
      treeEntry("skills/demo/SKILL.md"),
      treeEntry("skills/demo/references/notes.txt"),
    ];
    const blobs = new Map([
      ["skills/demo/SKILL.md", skillContent("demo")],
      ["skills/demo/references/notes.txt", "notes"],
    ]);
    const transport = {
      ...createTransport(tree, {}),
      getBlobText: vi
        .fn<GitHubTransport["getBlobText"]>()
        .mockImplementation(
          (_owner: string, _repo: string, blobSha: string) => {
            const content = blobs.get(blobSha);

            if (content === undefined) {
              throw new Error(`Missing fixture for ${blobSha}`);
            }

            return Promise.resolve(content);
          }
        ),
    };
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      definition: {
        content: skillContent("demo"),
        resources: [{ content: "notes", path: "references/notes.txt" }],
      },
      status: "resolved",
    });
    expect(transport.getBlobText).toHaveBeenCalledWith(
      "acme",
      "skills",
      "skills/demo/SKILL.md"
    );
  });

  it("reads resources with bounded concurrency while preserving order", async () => {
    const resourcePaths = Array.from(
      { length: 12 },
      (_, index) => `skills/demo/references/${index}.txt`
    );
    const tree = [
      treeEntry("skills/demo/SKILL.md"),
      ...resourcePaths.map((path) => treeEntry(path)),
    ];
    const files = Object.fromEntries(
      resourcePaths.map((path) => [path, path.split("/").at(-1) ?? path])
    );
    let inFlight = 0;
    let maxInFlight = 0;
    const transport = {
      ...createTransport(tree, {}),
      getBlobText: vi
        .fn<GitHubTransport["getBlobText"]>()
        .mockImplementation(async (_owner, _repo, blobSha) => {
          if (blobSha === "skills/demo/SKILL.md") {
            return skillContent("demo");
          }

          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await sleep(1);
          inFlight -= 1;

          return files[blobSha] ?? "";
        }),
    };
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      definition: {
        resources: resourcePaths.map((path) => ({
          content: path.split("/").at(-1) ?? path,
          path: path.slice("skills/demo/".length),
        })),
      },
      status: "resolved",
    });
    expect(maxInFlight).toBe(6);
  });

  it("fails preflight before reading blobs when a selected skill has too many resources", async () => {
    const resourcePaths = Array.from(
      { length: 201 },
      (_, index) => `skills/demo/references/${index}.txt`
    );
    const transport = createTransport(
      [
        treeEntry("skills/demo/SKILL.md"),
        ...resourcePaths.map((path) => treeEntry(path)),
      ],
      { "skills/demo/SKILL.md": skillContent("demo") }
    );
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "Skill has too many resources: 201 exceeds 200",
      selection: { skillName: "demo" },
      status: "failed",
    });
    expect(transport.getBlobText).not.toHaveBeenCalled();
  });

  it("fails preflight before reading blobs when selected skill files are too large", async () => {
    const transport = createTransport(
      [
        treeEntry("skills/demo/SKILL.md", 1_000_001),
        treeEntry("skills/demo/references/notes.txt", 1_000_000),
      ],
      { "skills/demo/SKILL.md": skillContent("demo") }
    );
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "Skill files are too large: 2000001 bytes exceeds 2000000",
      selection: { skillName: "demo" },
      status: "failed",
    });
    expect(transport.getBlobText).not.toHaveBeenCalled();
  });
  it("reads selected definitions from a pinned revision", async () => {
    const transport = createTransport([treeEntry("skills/demo/SKILL.md")], {
      "skills/demo/SKILL.md": skillContent("demo"),
    });
    const retrieval = createGitHubRetrieval(transport);

    await retrieval.readDefinitions(
      { ...origin, branch: "main", rev: "pinned-sha" },
      [{ skillName: "demo" }]
    );

    expect(transport.getCommit).toHaveBeenCalledWith(
      "acme",
      "skills",
      "pinned-sha"
    );
  });

  it("fails a selected definition with missing frontmatter name or description", async () => {
    const transport = createTransport([treeEntry("skills/demo/SKILL.md")], {
      "skills/demo/SKILL.md": "# No frontmatter",
    });
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "Skill frontmatter must include name and description",
      selection: { skillName: "demo" },
      status: "failed",
    });
  });

  it("fails a selected definition with unsupported resource extensions", async () => {
    const transport = createTransport(
      [
        treeEntry("skills/demo/SKILL.md"),
        treeEntry("skills/demo/assets/logo.png"),
      ],
      {
        "skills/demo/SKILL.md": skillContent("demo"),
      }
    );
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "Unsupported resource type: assets/logo.png",
      selection: { skillName: "demo" },
      status: "failed",
    });
    expect(transport.getBlobText).not.toHaveBeenCalled();
  });

  it("fails a selected definition with unsafe resource paths", async () => {
    const transport = createTransport(
      [
        treeEntry("skills/demo/SKILL.md"),
        treeEntry("skills/demo/bad\\path.txt"),
      ],
      {
        "skills/demo/SKILL.md": skillContent("demo"),
      }
    );
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "Unsafe resource path: bad\\path.txt",
      selection: { skillName: "demo" },
      status: "failed",
    });
  });

  it("returns per-selection failures when the repo snapshot cannot load", async () => {
    const transport = createTransport([], {});
    transport.getRepository.mockRejectedValue(new Error("network down"));
    const retrieval = createGitHubRetrieval(transport);

    const results = await retrieval.readDefinitions(origin, [
      { skillName: "one" },
      { skillName: "two" },
    ]);

    expect(results).toStrictEqual([
      {
        error: "GitHub request failed: network down",
        selection: { skillName: "one" },
        status: "failed",
      },
      {
        error: "GitHub request failed: network down",
        selection: { skillName: "two" },
        status: "failed",
      },
    ]);
  });

  it("normalizes blob read failures to definition failures", async () => {
    const transport = createTransport([treeEntry("skills/demo/SKILL.md")], {});
    const retrieval = createGitHubRetrieval(transport);

    const [result] = await retrieval.readDefinitions(origin, [
      { skillName: "demo" },
    ]);

    expect(result).toMatchObject({
      error: "GitHub blob request failed",
      selection: { skillName: "demo" },
      status: "failed",
    });
  });
});
