import { describe, expect, it } from "vitest";

import { getLibraryActions } from "./library-surface";

describe("library surface helpers", () => {
  it("makes Add to Library the primary library action", () => {
    expect(getLibraryActions()).toStrictEqual([
      {
        kind: "primary",
        label: "Add to Library",
        to: "/add-skill",
      },
      {
        kind: "secondary",
        label: "Create Skill",
        to: "/create-skill",
      },
    ]);
  });

  it("teaches both acquisition paths in the empty state", () => {
    expect(getLibraryActions("Create your first skill")).toStrictEqual([
      {
        kind: "primary",
        label: "Add to Library",
        to: "/add-skill",
      },
      {
        kind: "secondary",
        label: "Create your first skill",
        to: "/create-skill",
      },
    ]);
  });
});
