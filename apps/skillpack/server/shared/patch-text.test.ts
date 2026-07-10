import { describe, expect, it } from "vitest";

import { applyTextPatch } from "./patch-text";

describe(applyTextPatch, () => {
  it("replaces a single exact match", () => {
    const result = applyTextPatch("alpha beta gamma", "beta", "delta");

    expect(result).toStrictEqual({
      content: "alpha delta gamma",
      matchCount: 1,
      ok: true,
    });
  });

  it("rejects ambiguous matches unless replace_all is true", () => {
    const result = applyTextPatch("beta beta", "beta", "delta");

    expect(result).toMatchObject({
      code: "patch-string-ambiguous",
      ok: false,
    });
  });

  it("replaces every match when replace_all is true", () => {
    const result = applyTextPatch("beta beta", "beta", "delta", true);

    expect(result).toStrictEqual({
      content: "delta delta",
      matchCount: 2,
      ok: true,
    });
  });

  it("returns not found when old_string is missing", () => {
    const result = applyTextPatch("alpha", "missing", "delta");

    expect(result).toMatchObject({
      code: "patch-string-not-found",
      ok: false,
    });
  });
});
