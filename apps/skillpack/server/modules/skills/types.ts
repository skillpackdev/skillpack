import type {
  SkillResourceManifestItemJson,
  SkillVersionFrontmatterJson,
  skillVersionLabelsTable,
  skillVersionsTable,
  skillsTable,
} from "@server/db/schema";
import type {
  CreateSkillInput,
  ForkSkillInput,
  PatchSkillInput,
} from "@skillpack/contracts/skills/requests";
import type { SkillOriginJson } from "@skillpack/contracts/skills/state";

export type SkillIdentityRow = typeof skillsTable.$inferSelect;
export type SkillVersionRow = typeof skillVersionsTable.$inferSelect;
export type SkillVersionLabelRow = typeof skillVersionLabelsTable.$inferSelect;
export type SkillOrigin = SkillOriginJson;
export type SkillVersionFrontmatter = SkillVersionFrontmatterJson;
export type SkillResourceManifestItem = SkillResourceManifestItemJson;

export interface SkillResourceRow extends SkillResourceManifestItem {
  createdAt?: Date;
  skillPk: number;
  versionPk: number;
}

export type SkillRow = Omit<SkillIdentityRow, "headVersionPk"> &
  Pick<SkillVersionRow, "description" | "frontmatter"> & {
    allowedTools: string | null;
    compatibility: string | null;
    headVersionPk: number;
    license: string | null;
    metadata: Record<string, string> | null;
    skillFileSha256: string;
    skillFileSize: number;
    versionId: string;
  };

export interface SkillWithCurrentState {
  skill: SkillRow;
}

export interface SkillWithCurrentResource extends SkillWithCurrentState {
  resource: SkillResourceRow;
}

export interface SkillWithCurrentResources extends SkillWithCurrentState {
  resources: SkillResourceRow[];
}

export interface ResolvedSkillResult extends SkillWithCurrentState {
  content: string;
  resources: SkillResourceRow[];
}

export interface SkillActivationResult extends SkillWithCurrentState {
  resources: SkillResourceRow[];
  skillFileContent: string;
}

export interface SkillVersionListItem {
  createdAt: Date;
  id: string;
  label: string | null;
}

export interface SkillVersionHistoryResult {
  versions: SkillVersionListItem[];
}

export interface SkillVersionLabelResult {
  id: string;
  label: string;
  versionId: string;
}

export interface VersionedSkillResult extends ResolvedSkillResult {
  version: SkillVersionRow;
}

export interface SkillFileResource {
  mediaType: string;
  path: string;
  sha256: string;
  size: number;
}

export interface ReadSkillFileByNameInput {
  path: string;
  skillName: string;
}

export interface ReadSkillFileResult {
  object: R2ObjectBody;
  resource: SkillFileResource;
}

export interface ReadSkillTextFileResult {
  content: string;
  resource: SkillFileResource;
}

export interface StoredResourceObject {
  mediaType: string;
  path: string;
  sha256: string;
  size: number;
}

export interface TextResourceInput {
  content: string;
  mediaType?: string;
  path: string;
}

export interface PatchSkillResult {
  allowedTools: string | null;
  compatibility: string | null;
  description: string;
  license: string | null;
  metadata: Record<string, string> | null;
  name: string;
}

export type ForkSkillResult =
  | {
      selection: ForkSkillInput["selections"][number];
      skill: ResolvedSkillResult;
      status: "forked";
    }
  | {
      error: string;
      selection: ForkSkillInput["selections"][number];
      status: "failed";
    };

export interface ForkSkillServiceResult {
  results: ForkSkillResult[];
}

export type CreateSkillServiceInput = CreateSkillInput;
export type ForkSkillServiceInput = ForkSkillInput;
export type PatchSkillServiceInput = PatchSkillInput;

export interface VersionSelectorInput {
  skillName: string;
  versionId: string;
}
