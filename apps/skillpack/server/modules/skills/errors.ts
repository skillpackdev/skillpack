export type SkillErrorCode =
  | "duplicate-resource-path"
  | "duplicate-resolved-skill-name"
  | "duplicate-skill-name"
  | "empty-skill-patch"
  | "invalid-file-path"
  | "invalid-skill-locator"
  | "invalid-version-label"
  | "invalid-version-selector"
  | "reserved-resource-path"
  | "skill-file-not-found"
  | "skill-not-found"
  | "skill-object-not-found";

export class SkillModuleError extends Error {
  code: SkillErrorCode;

  constructor(code: SkillErrorCode, message: string) {
    super(message);
    this.name = "SkillModuleError";
    this.code = code;
  }
}

export const skillErrors = {
  duplicateResolvedSkillName: () =>
    new SkillModuleError(
      "duplicate-resolved-skill-name",
      "Multiple selected skills resolve to the same Skill Name"
    ),
  duplicateResourcePath: () =>
    new SkillModuleError(
      "duplicate-resource-path",
      "Resource paths must be unique"
    ),
  duplicateSkillName: () =>
    new SkillModuleError("duplicate-skill-name", "Skill name already exists"),
  emptySkillPatch: () =>
    new SkillModuleError(
      "empty-skill-patch",
      "PATCH must change Skill state or resources"
    ),
  invalidFilePath: () =>
    new SkillModuleError("invalid-file-path", "Valid file path is required"),
  invalidSkillLocator: () =>
    new SkillModuleError(
      "invalid-skill-locator",
      "Valid skill locator is required"
    ),
  invalidVersionLabel: () =>
    new SkillModuleError(
      "invalid-version-label",
      "Version label must not be empty"
    ),
  invalidVersionSelector: () =>
    new SkillModuleError(
      "invalid-version-selector",
      "Valid Skill Version ID is required"
    ),
  reservedResourcePath: () =>
    new SkillModuleError(
      "reserved-resource-path",
      "Resource path is reserved for SKILL.md"
    ),
  skillFileNotFound: () =>
    new SkillModuleError("skill-file-not-found", "Skill file not found"),
  skillNotFound: () =>
    new SkillModuleError("skill-not-found", "Skill not found"),
  skillObjectNotFound: () =>
    new SkillModuleError("skill-object-not-found", "Skill object not found"),
};
