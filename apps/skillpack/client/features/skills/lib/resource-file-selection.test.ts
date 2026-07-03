import type { ResolvedSkill } from "@skillpack/contracts/skills/responses";
import { describe, expect, it } from "vitest";

import {
  getLoadedResourceStatus,
  getSelectedSkillMarkdownFile,
  resourceLoadingFileStatus,
  resourceSelectFileStatus,
} from "./resource-file-selection";
import { skillFileMediaType, skillFilePath, getTextSize } from "./skill-files";
import type { SkillFile } from "./skill-files";

const makeSkillFile = (path: string): SkillFile => ({
  mediaType: "text/markdown",
  path,
  size: 0,
});

const makeSource = (content: string): Pick<ResolvedSkill, "content"> => ({
  content,
});

describe("resource file selection helpers", () => {
  it("exposes shared status copy", () => {
    expect(resourceLoadingFileStatus).toBe("Loading file...");
    expect(resourceSelectFileStatus).toBe("Select a file");
    expect(getLoadedResourceStatus("references/notes.md")).toBe(
      "Loaded references/notes.md"
    );
  });

  it("builds a SKILL.md descriptor from the resolved skill body", () => {
    const content = "# Demo Skill\n\nBody text.";
    const file = getSelectedSkillMarkdownFile(
      makeSource(content),
      makeSkillFile(skillFilePath)
    );

    expect(file).toStrictEqual({
      content,
      mediaType: skillFileMediaType,
      path: skillFilePath,
      size: getTextSize(content),
    });
  });

  it("returns undefined when SKILL.md is not the selected path", () => {
    expect(
      getSelectedSkillMarkdownFile(
        makeSource("content"),
        makeSkillFile("references/notes.md")
      )
    ).toBeUndefined();
  });

  it("returns undefined when there is no resolved source", () => {
    expect(
      getSelectedSkillMarkdownFile(undefined, makeSkillFile(skillFilePath))
    ).toBeUndefined();
  });

  it("returns undefined when no file is selected", () => {
    expect(getSelectedSkillMarkdownFile(makeSource("content"))).toBeUndefined();
  });
});
