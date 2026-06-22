import { describe, expect, it } from "vitest";

import {
  getMcpOAuthAudiences,
  getMcpOAuthResource,
  getOAuthAudiences,
} from "./oauth-audience";

const baseEnv = {
  BETTER_AUTH_SECRET: "test-secret",
  BUCKET: {},
  DB: {},
} as Env;

describe("OAuth audiences", () => {
  it("accepts the configured resource and the URL href form", () => {
    expect(getOAuthAudiences(baseEnv, "http://localhost:5173")).toStrictEqual([
      "http://localhost:5173",
      "http://localhost:5173/",
    ]);
  });

  it("uses the MCP endpoint as the MCP OAuth resource", () => {
    expect(getMcpOAuthResource(baseEnv, "http://localhost:5173")).toBe(
      "http://localhost:5173/mcp"
    );
  });

  it("uses AUTH_BASE_URL when building the MCP OAuth resource", () => {
    expect(
      getMcpOAuthResource(
        { ...baseEnv, AUTH_BASE_URL: "https://skillpack.example" } as Env,
        "http://localhost:5173"
      )
    ).toBe("https://skillpack.example/mcp");
  });

  it("deduplicates MCP resources that already use URL href form", () => {
    expect(
      getMcpOAuthAudiences(baseEnv, "http://localhost:5173/")
    ).toStrictEqual(["http://localhost:5173/mcp"]);
  });
});
