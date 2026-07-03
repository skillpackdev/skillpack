import type { SkillOriginInput } from "@skillpack/contracts/origins/requests";

const setOptionalParam = (
  searchParams: URLSearchParams,
  name: string,
  value: string | undefined
) => {
  if (value) {
    searchParams.set(name, value);
  }
};

export const toOriginSearchParams = (origin: SkillOriginInput) => {
  const searchParams = new URLSearchParams({ kind: origin.kind });

  if (origin.kind === "github") {
    searchParams.set("repoUrl", origin.repoUrl);
    setOptionalParam(searchParams, "branch", origin.branch);
    setOptionalParam(searchParams, "rev", origin.rev);
    return searchParams;
  }

  if (origin.kind === "npm") {
    searchParams.set("packageName", origin.packageName);
    setOptionalParam(searchParams, "version", origin.version);
  }

  return searchParams;
};

export const getOriginQueryKeyPart = (origin: SkillOriginInput) =>
  toOriginSearchParams(origin).toString();
