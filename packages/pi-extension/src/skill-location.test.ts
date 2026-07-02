import { describe, expect, it } from "vitest";

import {
  formatSkillpackCatalog,
  parseSkillpackLocation,
} from "./skill-location";

describe("Skillpack Skill Locations", () => {
  it("parses current Skillpack resource locations by Skill Name", () => {
    expect(parseSkillpackLocation("skill://demo-skill/SKILL.md")).toStrictEqual(
      {
        path: "SKILL.md",
        skillName: "demo-skill",
      }
    );
    expect(
      parseSkillpackLocation("skill://demo-skill/references/demo.md")
    ).toStrictEqual({
      path: "references/demo.md",
      skillName: "demo-skill",
    });
  });

  it("rejects malformed or pinned locations", () => {
    expect(() => parseSkillpackLocation("skill://demo-skill")).toThrow(
      "Expected skill://{skillName}/{path}"
    );
    expect(() => parseSkillpackLocation("skill://42/SKILL.md")).toThrow(
      "Expected skill://{skillName}/{path}"
    );
    expect(() =>
      parseSkillpackLocation("skill://demo-skill/SKILL.md?version=7")
    ).toThrow("Expected skill://{skillName}/{path}");
    expect(() =>
      parseSkillpackLocation("skill://demo-skill/../secret.md")
    ).toThrow("Expected skill://{skillName}/{path}");
    expect(() =>
      parseSkillpackLocation("skill://demo-skill/references/SKILL.md")
    ).toThrow("Expected skill://{skillName}/{path}");
  });

  it("formats catalog entries for system prompt injection", () => {
    expect(
      formatSkillpackCatalog([
        {
          description: "Use when checking <xml> escaping.",
          name: "demo-skill",
        },
      ])
    ).toContain("<location>skill://demo-skill/SKILL.md</location>");
    expect(
      formatSkillpackCatalog([
        {
          description: "Use when checking <xml> escaping.",
          name: "demo-skill",
        },
      ])
    ).toContain("Use when checking &lt;xml&gt; escaping.");
  });
});
