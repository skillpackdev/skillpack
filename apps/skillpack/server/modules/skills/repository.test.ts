import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createDb } from "@server/db/client";
import {
  skillVersionLabelsTable,
  skillVersionResourcesTable,
  skillVersionsTable,
} from "@server/db/schema";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SkillRepository } from "./repository";
import type { StoredResourceObject } from "./types";

const splitSqlStatements = (sql: string) =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

const applyMigration = async (db: D1Database, path: string) => {
  const sql = await readFile(path, "utf-8");

  for (const statement of splitSqlStatements(sql)) {
    await db.prepare(statement).run();
  }
};

const resources = (suffix: string): StoredResourceObject[] => [
  {
    mediaType: "text/markdown; charset=utf-8",
    path: "SKILL.md",
    sha256: `skill-${suffix}`,
    size: 120,
  },
  {
    mediaType: "text/plain; charset=utf-8",
    path: "references/notes.txt",
    sha256: `notes-${suffix}`,
    size: 5,
  },
];

const skillMetadata = (description = "First state") => ({
  allowedTools: "Read",
  compatibility: "Requires git",
  description,
  license: "Apache-2.0",
  metadata: { author: "acme" },
});

const createSkill = async (
  repository: SkillRepository,
  input?: { name?: string }
) => {
  const result = await repository.createSkill(
    {
      name: input?.name ?? "demo",
      resources: resources(input?.name ?? "demo"),
      skillFileMetadata: skillMetadata(),
    },
    new Date("2026-05-25T12:00:00.000Z")
  );

  return result.skill;
};

describe("skill repository persistence", () => {
  let mf: Miniflare;
  let repository: SkillRepository;
  let db: ReturnType<typeof createDb>;

  beforeEach(async () => {
    mf = new Miniflare({
      d1Databases: { DB: "skillpack-test" },
      modules: true,
      script: "export default { fetch: () => new Response('ok') };",
    });

    const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
    for (const migration of [
      "0000_initial.sql",
      "0001_better_auth_oauth_provider.sql",
      "0002_api_keys.sql",
      "0003_skill_version_history.sql",
    ]) {
      await applyMigration(d1, join(process.cwd(), "migrations", migration));
    }

    db = createDb(d1);
    repository = new SkillRepository(db, "user-a");
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("creates a current Skill state and resource manifest", async () => {
    const now = new Date("2026-05-25T12:00:00.000Z");

    const { skill } = await repository.createSkill(
      {
        name: "demo",
        resources: resources("v1"),
        skillFileMetadata: skillMetadata(),
      },
      now
    );

    const committedResources = await repository.listResourcesBySkillPk(
      skill.pk
    );

    expect(skill).toMatchObject({
      allowedTools: "Read",
      description: "First state",
      metadata: { author: "acme" },
      name: "demo",
    });
    expect(committedResources).toHaveLength(2);
    expect(
      committedResources.map((resource) => resource.skillPk)
    ).toStrictEqual([skill.pk, skill.pk]);
  });

  it("updates current Skill state by appending a version DAG node", async () => {
    const skill = await createSkill(repository);

    const updatedSkill = await repository.updateSkillState(
      {
        name: "demo-next",
        origin: null,
        resources: resources("v2"),
        skillFileMetadata: skillMetadata("Second state"),
        skillPk: skill.pk,
      },
      new Date("2026-05-25T12:01:00.000Z")
    );
    const versions = await db
      .select()
      .from(skillVersionsTable)
      .where(eq(skillVersionsTable.skillPk, skill.pk));
    const currentResources = await db
      .select()
      .from(skillVersionResourcesTable)
      .where(
        eq(
          skillVersionResourcesTable.versionPk,
          updatedSkill.headVersionPk ?? 0
        )
      );
    const historicalResources = await db
      .select()
      .from(skillVersionResourcesTable)
      .where(
        eq(skillVersionResourcesTable.versionPk, skill.headVersionPk ?? 0)
      );

    expect(updatedSkill).toMatchObject({
      description: "Second state",
      name: "demo-next",
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]?.parentPk).toBe(skill.headVersionPk);
    expect(
      new Set(currentResources.map((resource) => resource.sha256))
    ).toStrictEqual(new Set(["skill-v2", "notes-v2"]));
    expect(
      new Set(historicalResources.map((resource) => resource.sha256))
    ).toStrictEqual(new Set(["skill-demo", "notes-demo"]));
  });

  it("lists versions newest first with optional labels", async () => {
    const skill = await createSkill(repository);
    const updatedSkill = await repository.updateSkillState(
      {
        name: "demo",
        origin: null,
        resources: resources("v2"),
        skillFileMetadata: skillMetadata("Second state"),
        skillPk: skill.pk,
      },
      new Date("2026-05-25T12:01:00.000Z")
    );

    await repository.upsertVersionLabel(
      "demo",
      updatedSkill.versionId,
      "Known good",
      new Date("2026-05-25T12:02:00.000Z")
    );

    const history = await repository.listVersions("demo");

    expect(history).toStrictEqual([
      {
        createdAt: new Date("2026-05-25T12:01:00.000Z"),
        id: updatedSkill.versionId,
        label: "Known good",
      },
      {
        createdAt: new Date("2026-05-25T12:00:00.000Z"),
        id: skill.versionId,
        label: null,
      },
    ]);
  });

  it("edits and deletes one label per version", async () => {
    const skill = await createSkill(repository);

    const createdLabel = await repository.upsertVersionLabel(
      "demo",
      "current",
      "Known good",
      new Date("2026-05-25T12:01:00.000Z")
    );
    const updatedLabel = await repository.upsertVersionLabel(
      "demo",
      skill.versionId,
      "Demo ready",
      new Date("2026-05-25T12:02:00.000Z")
    );
    const labelsAfterEdit = await db.select().from(skillVersionLabelsTable);

    await repository.deleteVersionLabel("demo", skill.versionId);
    const labelsAfterDelete = await db.select().from(skillVersionLabelsTable);

    expect(updatedLabel).toMatchObject({
      id: createdLabel.id,
      label: "Demo ready",
      versionId: skill.versionId,
    });
    expect(labelsAfterEdit).toHaveLength(1);
    expect(labelsAfterEdit[0]?.updatedAt).toStrictEqual(
      new Date("2026-05-25T12:02:00.000Z")
    );
    expect(labelsAfterDelete).toHaveLength(0);
  });

  it("restores a historical version by appending a new head", async () => {
    const skill = await createSkill(repository);
    const updatedSkill = await repository.updateSkillState(
      {
        name: "demo",
        origin: null,
        resources: resources("v2"),
        skillFileMetadata: skillMetadata("Second state"),
        skillPk: skill.pk,
      },
      new Date("2026-05-25T12:01:00.000Z")
    );

    const restoredSkill = await repository.restoreVersion(
      "demo",
      skill.versionId,
      new Date("2026-05-25T12:02:00.000Z")
    );
    const versions = await db
      .select()
      .from(skillVersionsTable)
      .where(eq(skillVersionsTable.skillPk, skill.pk));
    const restoredResources = await repository.listResourcesBySkillPk(skill.pk);

    expect({
      description: restoredSkill.description,
      isNewHead:
        restoredSkill.headVersionPk !== skill.headVersionPk &&
        restoredSkill.headVersionPk !== updatedSkill.headVersionPk,
      parentPk: versions[2]?.parentPk,
      resourceSha256s: new Set(
        restoredResources.map((resource) => resource.sha256)
      ),
      versionCount: versions.length,
    }).toStrictEqual({
      description: "First state",
      isNewHead: true,
      parentPk: updatedSkill.headVersionPk,
      resourceSha256s: new Set(["skill-demo", "notes-demo"]),
      versionCount: 3,
    });
  });

  it("rejects restoring the current version selector", async () => {
    await createSkill(repository);

    await expect(
      repository.restoreVersion(
        "demo",
        "current",
        new Date("2026-05-25T12:02:00.000Z")
      )
    ).rejects.toMatchObject({ code: "invalid-version-selector" });
  });

  it("stores nullable origin JSON on current Skill state", async () => {
    const now = new Date("2026-05-25T12:00:00.000Z");

    const { skill } = await repository.createSkill(
      {
        name: "demo",
        origin: {
          kind: "github",
          metadata: { resolvedSkillPath: "skills/demo/SKILL.md" },
          url: "https://github.com/example/skills",
        },
        resources: resources("v1"),
        skillFileMetadata: skillMetadata(),
      },
      now
    );

    expect(skill.origin).toStrictEqual({
      kind: "github",
      metadata: { resolvedSkillPath: "skills/demo/SKILL.md" },
      url: "https://github.com/example/skills",
    });
  });

  it("scopes unique skill names and list results to one owner", async () => {
    const otherUserRepository = new SkillRepository(db, "user-b");
    const userSkill = await createSkill(repository, { name: "shared-name" });
    const otherUserSkill = await createSkill(otherUserRepository, {
      name: "shared-name",
    });

    await expect(
      createSkill(repository, { name: "shared-name" })
    ).rejects.toMatchObject({ code: "duplicate-skill-name" });

    const userSkills = await repository.listSkills();

    expect(userSkills).toHaveLength(1);
    expect(userSkills[0]?.skill.pk).toBe(userSkill.pk);
    await expect(
      repository.findSkillByPk(otherUserSkill.pk)
    ).resolves.toBeUndefined();
  });
});
