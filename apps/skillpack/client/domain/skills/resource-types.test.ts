import { describe, expect, it } from "vitest";

import {
  getExtension,
  getResourceType,
  getResourceTypeByExtension,
} from "./resource-types";

describe("resource type registry", () => {
  it("classifies the previously drifted script extensions as javascript code", () => {
    expect(getResourceType("components/Button.jsx")).toStrictEqual({
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    });
    expect(getResourceTypeByExtension("cjs")).toStrictEqual({
      editorLanguage: "javascript",
      highlightLanguage: "javascript",
      kind: "code",
      mediaType: "text/javascript",
    });
    expect(getResourceType("scripts/setup.bash")).toStrictEqual({
      editorLanguage: "shell",
      highlightLanguage: "bash",
      kind: "code",
      mediaType: "text/x-shellscript",
    });
  });

  it("classifies markdown and image resources", () => {
    expect(getResourceType("notes.md")?.kind).toBe("markdown");
    expect(getResourceType("assets/logo.png")?.kind).toBe("image");
  });

  it("falls through for unknown extensions", () => {
    expect(getResourceType("data.unknownext")).toBeUndefined();
    expect(getResourceTypeByExtension("xyz")).toBeUndefined();
  });

  it("extracts the lowercased last dot segment", () => {
    expect(getExtension("scripts/Run.PY")).toBe("py");
    expect(getExtension("noext")).toBe("noext");
    expect(getExtension("")).toBe("");
  });
});
