import { describe, expect, it } from "vitest";

import { getOAuthResource } from "./oauth-audience";

const baseEnv = {
  BETTER_AUTH_SECRET: "test-secret",
  BUCKET: {},
  DB: {},
} as Env;

describe("OAuth resource", () => {
  it("returns the origin without trailing slash", () => {
    expect(getOAuthResource(baseEnv, "http://localhost:5173")).toBe(
      "http://localhost:5173"
    );
    expect(getOAuthResource(baseEnv, "http://localhost:5173/")).toBe(
      "http://localhost:5173"
    );
  });

  it("strips the trailing slash from AUTH_BASE_URL", () => {
    expect(
      getOAuthResource(
        { ...baseEnv, AUTH_BASE_URL: "https://skillpack.example/" } as Env,
        "http://localhost:5173"
      )
    ).toBe("https://skillpack.example");
  });
});
