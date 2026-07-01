import type { AppBindings } from "@server/types";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import { skillsRoute } from "./route";
import type { SkillService } from "./service";
import type { ResolvedSkillResult } from "./types";

const createApp = (skillService: Partial<SkillService>) =>
  new Hono<AppBindings>()
    .use(async (c, next) => {
      c.set("skillService", skillService as SkillService);
      await next();
    })
    .route("/skills", skillsRoute);

const createdAt = new Date("2026-05-25T12:00:00.000Z");

const resolvedSkill = (input?: {
  id?: number;
  name?: string;
}): ResolvedSkillResult => ({
  content: "# Demo\n",
  resources: [],
  skill: {
    allowedTools: "Read",
    compatibility: null,
    createdAt,
    description: "Demo description",
    headVersionId: 10,
    id: input?.id ?? 1,
    license: null,
    metadata: null,
    name: input?.name ?? "demo",
    origin: null,
    ownerUserId: "user-a",
    updatedAt: createdAt,
  },
});

describe("skillsRoute owner scope", () => {
  it("lists skills without exposing internal Skill IDs", async () => {
    const listSkills = vi
      .fn<SkillService["listSkills"]>()
      .mockResolvedValue([
        { skill: resolvedSkill({ id: 123, name: "demo" }).skill },
      ] as Awaited<ReturnType<SkillService["listSkills"]>>);
    const app = createApp({ listSkills });

    const response = await app.request("/skills");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({
      skills: [
        {
          allowedTools: "Read",
          compatibility: null,
          createdAt: "2026-05-25T12:00:00.000Z",
          description: "Demo description",
          license: null,
          metadata: null,
          name: "demo",
          updatedAt: "2026-05-25T12:00:00.000Z",
        },
      ],
    });
    expect(listSkills).toHaveBeenCalledWith();
  });

  it("resolves Skill Names as the public operation identity", async () => {
    const resolveSkillByName = vi
      .fn<SkillService["resolveSkillByName"]>()
      .mockResolvedValue(resolvedSkill({ name: "demo-skill" }));
    const app = createApp({ resolveSkillByName });

    const response = await app.request("/skills/demo-skill");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "demo-skill",
    });
    expect(resolveSkillByName).toHaveBeenCalledWith("demo-skill");
  });

  it("rejects numeric Skill IDs at the public API boundary", async () => {
    const resolveSkillByName = vi.fn<SkillService["resolveSkillByName"]>();
    const app = createApp({ resolveSkillByName });

    const response = await app.request("/skills/123");

    expect(response.status).toBe(400);
    expect(resolveSkillByName).not.toHaveBeenCalled();
  });

  it("returns 404 for removed snapshot routes", async () => {
    const app = createApp({});

    const response = await app.request("/skills/demo/snapshots");

    expect(response.status).toBe(404);
  });

  it("reads resources by Skill Name", async () => {
    const readSkillTextFileByName = vi
      .fn<SkillService["readSkillTextFileByName"]>()
      .mockResolvedValue({
        content: "notes",
        resource: {
          mediaType: "text/plain",
          path: "references/notes.txt",
          sha256: "abc123",
          size: 5,
        },
      });
    const app = createApp({ readSkillTextFileByName });

    const response = await app.request(
      "/skills/demo/resources?path=references%2Fnotes.txt"
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ content: "notes" });
    expect(readSkillTextFileByName).toHaveBeenCalledWith({
      path: "references/notes.txt",
      skillName: "demo",
    });
  });
});
