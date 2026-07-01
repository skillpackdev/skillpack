import type {
  skillVersionResourcesTable,
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
export type SkillResourceRow =
  typeof skillVersionResourcesTable.$inferSelect & {
    skillId: number;
  };
export type SkillOrigin = SkillOriginJson;

export type SkillRow = Omit<SkillIdentityRow, "headVersionId"> &
  Pick<
    SkillVersionRow,
    | "allowedTools"
    | "compatibility"
    | "description"
    | "license"
    | "metadata"
    | "origin"
  > & {
    headVersionId: number;
  };

export interface SkillWithCurrentState {
  skill: SkillRow;
}

export interface ResolvedSkillResult extends SkillWithCurrentState {
  content: string;
  resources: SkillResourceRow[];
}

export interface SkillFileResource {
  mediaType: string;
  path: string;
  sha256: string;
  size: number;
}

export interface ReadSkillFileInput {
  path: string;
  skillId: number;
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
