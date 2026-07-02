import type { AppBindings } from "@server/types";

export type SkillpackMcpContext = Pick<
  AppBindings["Variables"],
  "currentUser" | "skillService"
>;
