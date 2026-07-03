import { skillContentPath } from "@server/constants";
import { parseSkillFile } from "@server/shared/skill-file";
import type { SkillOriginInput } from "@skillpack/contracts/origins/requests";
import { safeRelativePathSchema } from "@skillpack/core/primitives";
import ky from "ky";
import pMap from "p-map";

import { originErrors } from "../errors";
import type {
  OriginDefinitionResult,
  OriginDiscoveryResult,
  OriginSelection,
  OriginSkillDefinition,
} from "../types";

type GithubOrigin = Extract<SkillOriginInput, { kind: "github" }>;

interface GitHubRepository {
  default_branch: string;
}

interface GitHubCommit {
  commit: {
    tree: {
      sha: string;
    };
  };
  sha: string;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
}

interface GitHubBlobResponse {
  content: string;
  encoding: string;
}

export interface GitHubTreeEntry {
  path: string;
  sha: string;
  size?: number;
  type: "blob" | "tree";
}

interface GitHubOriginSnapshot {
  branch: string;
  owner: string;
  repo: string;
  repoUrl: string;
  rev: string;
  tree: GitHubTreeEntry[];
}

interface GitHubSkillFile {
  name: string;
  path: string;
  prefix: string;
  sha: string;
  size: number;
}

interface GitHubResourceFile {
  path: string;
  sha: string;
  size: number;
}

export interface GitHubTransport {
  getBlobText(owner: string, repo: string, blobSha: string): Promise<string>;
  getCommit(owner: string, repo: string, branch: string): Promise<GitHubCommit>;
  getRepository(owner: string, repo: string): Promise<GitHubRepository>;
  getTree(
    owner: string,
    repo: string,
    treeSha: string
  ): Promise<GitHubTreeResponse>;
}

interface GitHubTransportOptions {
  githubClientId?: string;
  githubClientSecret?: string;
}

const createBasicAuthHeader = (clientId: string, clientSecret: string) => {
  const credentials = `${clientId}:${clientSecret}`;
  return `Basic ${btoa(credentials)}`;
};

const createGitHubApiHeaders = ({
  githubClientId,
  githubClientSecret,
}: GitHubTransportOptions) => {
  const clientId = githubClientId?.trim();
  const clientSecret = githubClientSecret?.trim();

  if (Boolean(clientId) !== Boolean(clientSecret)) {
    throw new Error(
      "Both GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required"
    );
  }

  return {
    accept: "application/vnd.github+json",
    ...(clientId && clientSecret
      ? { authorization: createBasicAuthHeader(clientId, clientSecret) }
      : {}),
    "user-agent": "skillpack",
  };
};

const decodeBase64Text = (content: string) => {
  const binary = atob(content.replaceAll(/\s/gu, ""));
  const bytes = Uint8Array.from(
    binary,
    (character) => character.codePointAt(0) ?? 0
  );
  return new TextDecoder().decode(bytes);
};

export const createGitHubTransport = (
  options: GitHubTransportOptions = {}
): GitHubTransport => {
  // ADR-0005: public GitHub Origin reads use OAuth App credentials and REST blobs.
  const githubApi = ky.create({
    headers: createGitHubApiHeaders(options),
    prefix: "https://api.github.com",
  });

  return {
    getBlobText: async (owner, repo, blobSha) => {
      const blob = await githubApi
        .get(`repos/${owner}/${repo}/git/blobs/${blobSha}`)
        .json<GitHubBlobResponse>();

      if (blob.encoding !== "base64") {
        throw new Error("Unsupported GitHub blob encoding");
      }

      return decodeBase64Text(blob.content);
    },
    getCommit: (owner, repo, branch) =>
      githubApi
        .get(`repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`)
        .json<GitHubCommit>(),
    getRepository: (owner, repo) =>
      githubApi.get(`repos/${owner}/${repo}`).json<GitHubRepository>(),
    getTree: (owner, repo, treeSha) =>
      // Follow-up: if public repo reads hit large payloads or tree truncation,
      // switch to targeted non-recursive walks over Skillpack priority roots.
      githubApi
        .get(`repos/${owner}/${repo}/git/trees/${treeSha}`, {
          searchParams: { recursive: "1" },
        })
        .json<GitHubTreeResponse>(),
  };
};

const priorityPrefixes = [
  "",
  "skills/",
  "skills/.curated/",
  "skills/.experimental/",
  "skills/.system/",
  ".agents/skills/",
  ".claude/skills/",
  ".codex/skills/",
] as const;

const allowedTextResourceExtensions = new Set([
  ".md",
  ".txt",
  ".json",
  ".js",
  ".mjs",
  ".ts",
  ".py",
  ".sh",
]);

const maxFallbackSkillPathDepth = 6;
const maxGitHubSkillResourceCount = 200;
const maxGitHubSkillTotalBytes = 2_000_000;
const githubResourceReadConcurrency = 6;

const isSkillFilePath = (path: string) =>
  path.toLowerCase().endsWith(`/${skillContentPath.toLowerCase()}`) ||
  path.toLowerCase() === skillContentPath.toLowerCase();

const parseGitHubRepoUrl = (repoUrl: string) => {
  const url = new URL(repoUrl);
  const [owner, repo] = url.pathname.replaceAll(/^\/|\.git$/gu, "").split("/");

  if (url.hostname !== "github.com" || !(owner && repo)) {
    throw originErrors.discoveryFailed("Valid GitHub repository URL required");
  }

  return { owner, repo };
};

const getDirectoryPrefix = (skillPath: string) => {
  const index = skillPath.lastIndexOf("/");
  return index === -1 ? "" : `${skillPath.slice(0, index)}/`;
};

const getCandidateName = (repo: string, skillPath: string) => {
  const prefix = getDirectoryPrefix(skillPath);

  if (!prefix) {
    return repo;
  }

  const parts = prefix.slice(0, -1).split("/");
  return parts.at(-1) ?? repo;
};

const getExtension = (path: string) => {
  const fileName = path.split("/").at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");

  if (dotIndex <= 0) {
    return;
  }

  return fileName.slice(dotIndex).toLowerCase();
};

const assertTextResourcePath = (path: string) => {
  const extension = getExtension(path);

  if (!(extension && allowedTextResourceExtensions.has(extension))) {
    throw originErrors.definitionFailed(`Unsupported resource type: ${path}`);
  }
};

const assertSafeResourcePath = (path: string) => {
  if (!safeRelativePathSchema.safeParse(path).success) {
    throw originErrors.definitionFailed(`Unsafe resource path: ${path}`);
  }
};

const discoverPrioritySkillPaths = (tree: GitHubTreeEntry[]) => {
  const skillPaths = tree
    .filter((entry) => entry.type === "blob" && isSkillFilePath(entry.path))
    .map((entry) => entry.path);
  const discovered: string[] = [];
  const seenPaths = new Set<string>();

  for (const prefix of priorityPrefixes) {
    for (const path of skillPaths) {
      if (!path.startsWith(prefix)) {
        continue;
      }

      const rest = path.slice(prefix.length);
      const parts = rest.split("/");
      const isDirectRootSkill =
        prefix === "" && rest.toLowerCase() === "skill.md";
      const isOneLevelSkill =
        prefix !== "" &&
        parts.length === 2 &&
        parts.at(-1)?.toLowerCase() === "skill.md";

      if ((isDirectRootSkill || isOneLevelSkill) && !seenPaths.has(path)) {
        discovered.push(path);
        seenPaths.add(path);
      }
    }
  }

  return discovered;
};

const discoverFallbackSkillPaths = (tree: GitHubTreeEntry[]) =>
  tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        isSkillFilePath(entry.path) &&
        entry.path.split("/").length <= maxFallbackSkillPathDepth
    )
    .map((entry) => entry.path);

const discoverSkillFiles = (snapshot: GitHubOriginSnapshot) => {
  const priorityPaths = discoverPrioritySkillPaths(snapshot.tree);
  const skillPaths =
    priorityPaths.length > 0
      ? priorityPaths
      : discoverFallbackSkillPaths(snapshot.tree);
  const entriesByPath = new Map(
    snapshot.tree.map((entry) => [entry.path, entry] as const)
  );
  const byName = new Map<string, GitHubSkillFile>();

  for (const path of skillPaths) {
    const entry = entriesByPath.get(path);

    if (!(entry && safeRelativePathSchema.safeParse(path).success)) {
      continue;
    }

    const name = getCandidateName(snapshot.repo, path);

    if (!byName.has(name)) {
      byName.set(name, {
        name,
        path,
        prefix: getDirectoryPrefix(path),
        sha: entry.sha,
        size: entry.size ?? 0,
      });
    }
  }

  return [...byName.values()];
};

const parseSkillMetadata = (content: string) => {
  try {
    return parseSkillFile(content);
  } catch {
    throw originErrors.definitionFailed(
      "Skill frontmatter must include name and description"
    );
  }
};

const findSkillFile = (
  snapshot: GitHubOriginSnapshot,
  selection: OriginSelection,
  discoveredSkillFiles: GitHubSkillFile[]
) => {
  const skillFile = discoveredSkillFiles.find(
    (file) => file.name === selection.skillName
  );

  if (!skillFile) {
    throw originErrors.definitionFailed("Skill file not found");
  }

  return skillFile;
};

const readBlobText = async (
  transport: GitHubTransport,
  snapshot: GitHubOriginSnapshot,
  blobSha: string
) => {
  try {
    return await transport.getBlobText(snapshot.owner, snapshot.repo, blobSha);
  } catch {
    throw originErrors.definitionFailed("GitHub blob request failed");
  }
};

const getResourceFiles = (
  snapshot: GitHubOriginSnapshot,
  skillPath: string,
  skillPrefix: string
): GitHubResourceFile[] => {
  const resources: GitHubResourceFile[] = [];

  for (const entry of snapshot.tree) {
    if (entry.type !== "blob" || !entry.path.startsWith(skillPrefix)) {
      continue;
    }

    if (entry.path === skillPath) {
      continue;
    }

    const path = entry.path.slice(skillPrefix.length);
    assertSafeResourcePath(path);
    assertTextResourcePath(path);

    resources.push({
      path,
      sha: entry.sha,
      size: entry.size ?? 0,
    });
  }

  return resources;
};

const assertForkPreflight = (
  skillFile: GitHubSkillFile,
  resourceFiles: GitHubResourceFile[]
) => {
  if (resourceFiles.length > maxGitHubSkillResourceCount) {
    throw originErrors.definitionFailed(
      `Skill has too many resources: ${resourceFiles.length} exceeds ${maxGitHubSkillResourceCount}`
    );
  }

  const totalSize = resourceFiles.reduce(
    (total, resource) => total + resource.size,
    skillFile.size
  );

  if (totalSize > maxGitHubSkillTotalBytes) {
    throw originErrors.definitionFailed(
      `Skill files are too large: ${totalSize} bytes exceeds ${maxGitHubSkillTotalBytes}`
    );
  }
};

const readResources = (
  transport: GitHubTransport,
  snapshot: GitHubOriginSnapshot,
  resourceFiles: GitHubResourceFile[]
) =>
  pMap(
    resourceFiles,
    async (resource) => ({
      content: await readBlobText(transport, snapshot, resource.sha),
      path: resource.path,
    }),
    { concurrency: githubResourceReadConcurrency }
  );

const getGitHubRequestFailureMessage = async (error: unknown) => {
  if (error instanceof Error && "response" in error) {
    const { response } = error;

    if (response instanceof Response) {
      try {
        const body = (await response.clone().json()) as { message?: unknown };

        if (typeof body.message === "string") {
          return `GitHub request failed: ${body.message}`;
        }
      } catch {
        return `GitHub request failed: HTTP ${response.status}`;
      }

      return `GitHub request failed: HTTP ${response.status}`;
    }
  }

  if (error instanceof Error && error.message) {
    return `GitHub request failed: ${error.message}`;
  }

  return "GitHub request failed";
};

const loadOriginSnapshot = async (
  transport: GitHubTransport,
  origin: GithubOrigin
): Promise<GitHubOriginSnapshot> => {
  try {
    const { owner, repo } = parseGitHubRepoUrl(origin.repoUrl);
    const repoInfo = await transport.getRepository(owner, repo);
    const branch = origin.branch ?? repoInfo.default_branch;
    const commit = await transport.getCommit(owner, repo, origin.rev ?? branch);
    const tree = await transport.getTree(owner, repo, commit.commit.tree.sha);

    return {
      branch,
      owner,
      repo,
      repoUrl: origin.repoUrl,
      rev: commit.sha,
      tree: tree.tree,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "OriginModuleError") {
      throw error;
    }

    throw originErrors.discoveryFailed(
      await getGitHubRequestFailureMessage(error)
    );
  }
};

const readDefinition = async (
  transport: GitHubTransport,
  snapshot: GitHubOriginSnapshot,
  selection: OriginSelection,
  skillFiles: GitHubSkillFile[]
): Promise<OriginSkillDefinition> => {
  const skillFile = findSkillFile(snapshot, selection, skillFiles);
  const resourceFiles = getResourceFiles(
    snapshot,
    skillFile.path,
    skillFile.prefix
  );
  assertForkPreflight(skillFile, resourceFiles);
  const content = await readBlobText(transport, snapshot, skillFile.sha);
  const metadata = parseSkillMetadata(content);

  return {
    allowedTools: metadata.allowedTools,
    compatibility: metadata.compatibility,
    content,
    description: metadata.description,
    license: metadata.license,
    metadata: metadata.metadata,
    name: metadata.name,
    provenance: {
      kind: "github",
      metadata: {
        branch: snapshot.branch,
        resolvedSkillPath: skillFile.path,
        rev: snapshot.rev,
      },
      url: snapshot.repoUrl,
    },
    resources: await readResources(transport, snapshot, resourceFiles),
    selection,
  };
};

export const createGitHubRetrieval = (transport: GitHubTransport) => ({
  async discover(origin: GithubOrigin): Promise<OriginDiscoveryResult> {
    const snapshot = await loadOriginSnapshot(transport, origin);
    const skillFiles = discoverSkillFiles(snapshot);

    return {
      candidates: skillFiles.map((file) => ({
        name: file.name,
        path: file.path,
        selection: { skillName: file.name },
      })),
      origin,
      resolvedOrigin: {
        branch: snapshot.branch,
        kind: "github",
        repoUrl: snapshot.repoUrl,
        rev: snapshot.rev,
      },
    };
  },

  async readDefinitions(
    origin: GithubOrigin,
    selections: OriginSelection[]
  ): Promise<OriginDefinitionResult[]> {
    let snapshot: GitHubOriginSnapshot;

    try {
      snapshot = await loadOriginSnapshot(transport, origin);
    } catch (error) {
      return selections.map((selection) => ({
        error: error instanceof Error ? error.message : "Origin read failed",
        selection,
        status: "failed",
      }));
    }

    const skillFiles = discoverSkillFiles(snapshot);
    const results: OriginDefinitionResult[] = [];

    for (const selection of selections) {
      try {
        results.push({
          definition: await readDefinition(
            transport,
            snapshot,
            selection,
            skillFiles
          ),
          status: "resolved",
        });
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : "Skill read failed",
          selection,
          status: "failed",
        });
      }
    }

    return results;
  },
});
