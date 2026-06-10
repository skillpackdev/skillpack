import { describe, expect, it } from "vitest";

import { getOAuthAudiences } from "./oauth-audience";

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

  it("deduplicates resources that already use URL href form", () => {
    expect(getOAuthAudiences(baseEnv, "http://localhost:5173/")).toStrictEqual([
      "http://localhost:5173/",
    ]);
  });

  it("uses AUTH_BASE_URL when configured", () => {
    expect(
      getOAuthAudiences(
        { ...baseEnv, AUTH_BASE_URL: "https://skillpack.example" } as Env,
        "http://localhost:5173"
      )
    ).toStrictEqual([
      "https://skillpack.example",
      "https://skillpack.example/",
    ]);
  });
});
