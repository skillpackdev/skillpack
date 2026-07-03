import { z } from "zod";

export const skillOriginJsonSchema = z.object({
  kind: z.literal("github"),
  metadata: z.record(z.unknown()).nullable(),
  url: z.string().url(),
});

export type SkillOriginJson = z.infer<typeof skillOriginJsonSchema>;
