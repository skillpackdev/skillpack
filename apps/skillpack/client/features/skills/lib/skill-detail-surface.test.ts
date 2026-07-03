import { describe, expect, it } from "vitest";

import { getDetailFileSwitcherLabel } from "./skill-detail-surface";

describe("skill detail surface helpers", () => {
  it("uses the selected file path in the mobile file switcher label", () => {
    expect(getDetailFileSwitcherLabel()).toBe("Files · SKILL.md");
    expect(getDetailFileSwitcherLabel("resources/notes.md")).toBe(
      "Files · resources/notes.md"
    );
  });
});
