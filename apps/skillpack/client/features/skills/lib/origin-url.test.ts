import { describe, expect, it } from "vitest";

import { toOriginSearchParams } from "./origin-url";

describe("origin URL helpers", () => {
  it("serializes stable GitHub params", () => {
    expect(
      toOriginSearchParams({
        branch: "main",
        kind: "github",
        repoUrl: "https://github.com/acme/skills",
        rev: "abc123",
      }).toString()
    ).toBe(
      "kind=github&repoUrl=https%3A%2F%2Fgithub.com%2Facme%2Fskills&branch=main&rev=abc123"
    );
  });
});
