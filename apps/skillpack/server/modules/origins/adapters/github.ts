import type { SkillOriginInput } from "@skillpack/contracts/origins/requests";

import type { OriginAdapter } from "../types";
import {
  createGitHubRetrieval,
  createGitHubTransport,
} from "./github-retrieval";
import type { GitHubTransport } from "./github-retrieval";

type GithubOrigin = Extract<SkillOriginInput, { kind: "github" }>;

interface GithubOriginAdapterOptions {
  githubClientId?: string;
  githubClientSecret?: string;
  transport?: GitHubTransport;
}

export const createGithubOriginAdapter = ({
  githubClientId,
  githubClientSecret,
  transport = createGitHubTransport({ githubClientId, githubClientSecret }),
}: GithubOriginAdapterOptions = {}): OriginAdapter<GithubOrigin> => {
  const retrieval = createGitHubRetrieval(transport);

  return {
    discover: retrieval.discover,
    kind: "github",
    readDefinitions: retrieval.readDefinitions,
  };
};
