import type {
  ResourceManifestItem,
  ResolvedSkill,
  SkillListItem,
  SkillListResponse,
  SkillResourceResponse,
} from "@skillpack/contracts/skills/responses";

import {
  parseSkillpackLocation,
  skillFilePath,
  toSkillpackLocation,
} from "./skill-location";

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface SkillpackClientOptions {
  fetch?: Fetch;
  getBaseUrl: () => Promise<string>;
  getAccessToken: () => Promise<string | undefined>;
}

export interface SkillpackResolvedSkill {
  content: string;
  description: string;
  location: string;
  name: string;
  resources: ResourceManifestItem[];
}

export type SkillpackResource =
  | (Pick<SkillResourceResponse, "mediaType" | "path" | "sha256" | "size"> & {
      content: string;
      encoding: "text";
    })
  | {
      content: string;
      encoding: "base64";
      mediaType: string;
      path: string;
      sha256: string;
      size: number;
    };

const textMediaTypePattern =
  /^(application\/json|[^/]+\/(?:[^+;]+\+)?(?:json|xml)|text\/)/iu;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "");

const appendSearchParams = (
  url: URL,
  params: Record<string, string | number | undefined>
) => {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
};

const readBytes = async (response: Response) =>
  new Uint8Array(await response.arrayBuffer());

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

const isTextMediaType = (mediaType: string) =>
  textMediaTypePattern.test(mediaType);

const readRawResource = async (
  response: Response,
  path: string
): Promise<SkillpackResource> => {
  const bytes = await readBytes(response);
  const mediaType =
    response.headers.get("content-type") ?? "application/octet-stream";

  if (isTextMediaType(mediaType)) {
    return {
      content: new TextDecoder().decode(bytes),
      encoding: "text",
      mediaType,
      path,
      sha256: response.headers.get("x-skill-resource-sha256") ?? "",
      size: bytes.byteLength,
    };
  }

  return {
    content: toBase64(bytes),
    encoding: "base64",
    mediaType,
    path,
    sha256: response.headers.get("x-skill-resource-sha256") ?? "",
    size: bytes.byteLength,
  };
};

const isJsonResponse = (response: Response) =>
  (response.headers.get("content-type") ?? "").includes("application/json");

const getRawResourceUrl = (
  baseUrl: string,
  skillName: string,
  path: string
) => {
  const rawUrl = new URL(`${baseUrl}/api/v1/skills/${skillName}/resources/raw`);
  appendSearchParams(rawUrl, { path });
  return rawUrl;
};

const readJsonResource = async (response: Response) => {
  const body = (await response.json()) as SkillResourceResponse;
  if (!isTextMediaType(body.mediaType)) {
    return;
  }

  return { ...body, encoding: "text" as const };
};

const toErrorBody = async (response: Response) => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new TextDecoder().decode(bytes);
};

export class SkillpackClient {
  private readonly fetch: Fetch;

  private readonly getBaseUrl: () => Promise<string>;

  private readonly getAccessToken: () => Promise<string | undefined>;

  constructor(options: SkillpackClientOptions) {
    this.fetch = options.fetch ?? fetch;
    this.getBaseUrl = options.getBaseUrl;
    this.getAccessToken = options.getAccessToken;
  }

  async listSkills(): Promise<SkillListItem[]> {
    const response = await this.request(
      (baseUrl) => `${baseUrl}/api/v1/skills`
    );
    const body = (await response.json()) as SkillListResponse;
    return body.skills;
  }

  async readSkill(location: string): Promise<SkillpackResolvedSkill> {
    const parsed = parseSkillpackLocation(location);
    if (parsed.path !== skillFilePath) {
      throw new Error("Expected skill://{skillName}/SKILL.md");
    }

    const response = await this.request(
      (baseUrl) => new URL(`${baseUrl}/api/v1/skills/${parsed.skillName}`)
    );
    const body = (await response.json()) as ResolvedSkill;

    return {
      content: body.content,
      description: body.description,
      location: toSkillpackLocation(body.name),
      name: body.name,
      resources: body.resources,
    };
  }

  async readResource(location: string): Promise<SkillpackResource> {
    const parsed = parseSkillpackLocation(location);
    const textResponse = await this.request((baseUrl) => {
      const textUrl = new URL(
        `${baseUrl}/api/v1/skills/${parsed.skillName}/resources`
      );
      appendSearchParams(textUrl, { path: parsed.path });
      return textUrl;
    });

    if (isJsonResponse(textResponse)) {
      const textResource = await readJsonResource(textResponse);
      if (textResource) {
        return textResource;
      }

      const rawResponse = await this.request((baseUrl) =>
        getRawResourceUrl(baseUrl, parsed.skillName, parsed.path)
      );
      return readRawResource(rawResponse, parsed.path);
    }

    return readRawResource(textResponse, parsed.path);
  }

  private async request(input: (baseUrl: string) => string | URL) {
    const baseUrl = trimTrailingSlash(await this.getBaseUrl());
    const token = await this.getAccessToken();

    if (!token) {
      throw new Error("Run /login skillpack before reading Skillpack skills");
    }

    const url = input(baseUrl);
    const response = await this.fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await toErrorBody(response);
      throw new Error(`Skillpack API failed: ${response.status} ${body}`);
    }

    return response;
  }
}
