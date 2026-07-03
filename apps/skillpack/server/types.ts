import type { createDb } from "./db/client";
import type { ApiKeyService } from "./modules/api-keys/service";
import type { OriginService } from "./modules/origins/service";
import type { SkillService } from "./modules/skills/service";
import type { SkillStorage } from "./modules/skills/storage";

export type Database = ReturnType<typeof createDb>;

export interface AppBindings {
  Bindings: Env;
  Variables: {
    apiKeyService: ApiKeyService;
    currentUser: { canWrite?: boolean; id: string };
    db: Database;
    originService: OriginService;
    skillService: SkillService;
    skillStorage: SkillStorage;
  };
}
