import { Hono } from "hono";

import { apiKeysRoute } from "../modules/api-keys/route";
import { originsRoute } from "../modules/origins/route";
import { skillsRoute } from "../modules/skills/route";
import type { AppBindings } from "../types";
import { healthRoute } from "./health";

export const apiRoutes = new Hono<AppBindings>()
  .route("/api", healthRoute)
  .route("/api/v1/api-keys", apiKeysRoute)
  .route("/api/v1/origins", originsRoute)
  .route("/api/v1/skills", skillsRoute);
