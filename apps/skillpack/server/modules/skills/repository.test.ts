import { skillContentPath } from "@server/constants";
import { createDb } from "@server/db/client";
import { skillVersionLabelsTable, skillVersionsTable } from "@server/db/schema";
import {
  applyMigration,
  applyMigrations,
  currentMigrations,
  migrationsThroughVersionHistory,
} from "@server/test/migrations";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SkillRepository } from "./repository";
import type { StoredResourceObject } from "./types";

const skillFile = (suffix: string): StoredResourceObject => ({
  mediaType: "text/markdown; charset=utf-8",
  path: skillContentPath,
  sha256: `skill-${suffix}`,
  size: 120,
});

const resources = (suffix: string): StoredResourceObject[] => [
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
  frontmatter: {
    "allowed-tools": "Read",
    compatibility: "Requires git",
    license: "Apache-2.0",
    metadata: { author: "acme" },
  },
  license: "Apache-2.0",
  metadata: { author: "acme" },
});

const createSkill = async (
  repository: SkillRepository,
  input?: { name?: string }
) => {
  const suffix = input?.name ?? "demo";
  const result = await repository.createSkill(
    {
      name: input?.name ?? "demo",
      resources: resources(suffix),
      skillFile: skillFile(suffix),
      skillFileMetadata: skillMetadata(),
    },
    new Date("2026-05-25T12:00:00.000Z")
  );

  return result.skill;
};

describe("skill repository migrations", () => {
  it("backfills SKILL.md pointers, attached manifests, and Skill Origin", async () => {
    const mf = new Miniflare({
      d1Databases: { DB: "skillpack-migration-test" },
      modules: true,
      script: "export default { fetch: () => new Response('ok') };",
    });

    try {
      const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
      await applyMigrations(d1, migrationsThroughVersionHistory);
      await d1
        .prepare(
          "INSERT INTO skills (pk, owner_user_id, name, head_version_pk, created_at, updated_at) VALUES (1, 'user-a', 'demo', 10, 1780000000000, 1780000000000)"
        )
        .run();
      await d1
        .prepare(
          'INSERT INTO skill_versions (pk, id, skill_pk, parent_pk, description, license, compatibility, allowed_tools, metadata, origin, created_at) VALUES (10, \'version-one\', 1, NULL, \'Demo skill\', \'Apache-2.0\', \'Requires git\', \'Read\', \'{"author":"acme"}\', \'{"kind":"github","metadata":{"resolvedSkillPath":"skills/demo/SKILL.md"},"url":"https://github.com/example/skills"}\', 1780000000000)'
        )
        .run();
      await d1
        .prepare(
          "INSERT INTO skill_version_resources (version_pk, path, sha256, media_type, size, created_at) VALUES (10, 'SKILL.md', 'skill-md-sha', 'text/markdown; charset=utf-8', 123, 1780000000000), (10, 'references/notes.txt', 'notes-sha', 'text/plain; charset=utf-8', 5, 1780000000000)"
        )
        .run();
      await applyMigration(d1, "0004_inline_skill_version_snapshots.sql");

      const repository = new SkillRepository(createDb(d1), "user-a");
      const skill = await repository.findSkillByName("demo");
      const migratedResources = await repository.listResourcesBySkillPk(
        skill?.pk ?? 0
      );
      const skillFileResource = await repository.findResourceByName(
        "demo",
        skillContentPath
      );

      expect(skill).toMatchObject({
        allowedTools: "Read",
        compatibility: "Requires git",
        description: "Demo skill",
        license: "Apache-2.0",
        metadata: { author: "acme" },
        origin: {
          kind: "github",
          metadata: { resolvedSkillPath: "skills/demo/SKILL.md" },
          url: "https://github.com/example/skills",
        },
        skillFileSha256: "skill-md-sha",
        skillFileSize: 123,
      });
      expect(migratedResources).toStrictEqual([
        expect.objectContaining({
          path: "references/notes.txt",
          sha256: "notes-sha",
        }),
      ]);
      expect(skillFileResource).toMatchObject({
        path: skillContentPath,
        sha256: "skill-md-sha",
      });
    } finally {
      await mf.dispose();
    }
  });
});

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
    await applyMigrations(d1, currentMigrations);

    db = createDb(d1);
    repository = new SkillRepository(db, "user-a");
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("creates a current Skill state with first-class SKILL.md and attached resources", async () => {
    const now = new Date("2026-05-25T12:00:00.000Z");

    const { skill } = await repository.createSkill(
      {
        name: "demo",
        resources: resources("v1"),
        skillFile: skillFile("v1"),
        skillFileMetadata: skillMetadata(),
      },
      now
    );

    const committedResources = await repository.listResourcesBySkillPk(
      skill.pk
    );
    const skillFileResource = await repository.findResourceByName(
      "demo",
      skillContentPath
    );
    const completeResources = await repository.listSkillsWithCurrentResources();

    expect(skill).toMatchObject({
      allowedTools: "Read",
      description: "First state",
      metadata: { author: "acme" },
      name: "demo",
      skillFileSha256: "skill-v1",
    });
    expect(committedResources).toStrictEqual([
      expect.objectContaining({
        path: "references/notes.txt",
        sha256: "notes-v1",
        skillPk: skill.pk,
      }),
    ]);
    expect(skillFileResource).toMatchObject({
      path: skillContentPath,
      sha256: "skill-v1",
      size: 120,
    });
    expect(
      completeResources[0]?.resources.map((resource) => resource.path)
    ).toStrictEqual([skillContentPath, "references/notes.txt"]);
  });

  it("updates current Skill state by appending a version DAG node", async () => {
    const skill = await createSkill(repository);

    const updatedSkill = await repository.updateSkillState(
      {
        name: "demo-next",
        origin: null,
        resources: resources("v2"),
        skillFile: skillFile("v2"),
        skillFileMetadata: skillMetadata("Second state"),
        skillPk: skill.pk,
      },
      new Date("2026-05-25T12:01:00.000Z")
    );
    const versions = await db
      .select()
      .from(skillVersionsTable)
      .where(eq(skillVersionsTable.skillPk, skill.pk));
    const currentVersion = versions.find(
      (version) => version.pk === updatedSkill.headVersionPk
    );
    const historicalVersion = versions.find(
      (version) => version.pk === skill.headVersionPk
    );

    expect(updatedSkill).toMatchObject({
      description: "Second state",
      name: "demo-next",
      skillFileSha256: "skill-v2",
    });
    expect(versions).toHaveLength(2);
    expect(currentVersion?.parentPk).toBe(skill.headVersionPk);
    expect(currentVersion?.resourceManifest).toStrictEqual([
      expect.objectContaining({ sha256: "notes-v2" }),
    ]);
    expect(historicalVersion).toMatchObject({
      resourceManifest: [expect.objectContaining({ sha256: "notes-demo" })],
      skillFileSha256: "skill-demo",
    });
  });

  it("lists versions newest first with optional labels", async () => {
    const skill = await createSkill(repository);
    const updatedSkill = await repository.updateSkillState(
      {
        name: "demo",
        origin: null,
        resources: resources("v2"),
        skillFile: skillFile("v2"),
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
        skillFile: skillFile("v2"),
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
    const restoredSkillFile = await repository.findResourceByName(
      "demo",
      skillContentPath
    );

    expect({
      description: restoredSkill.description,
      isNewHead:
        restoredSkill.headVersionPk !== skill.headVersionPk &&
        restoredSkill.headVersionPk !== updatedSkill.headVersionPk,
      parentPk: versions[2]?.parentPk,
      resourceSha256s: new Set(
        restoredResources.map((resource) => resource.sha256)
      ),
      skillFileSha256: restoredSkillFile?.sha256,
      versionCount: versions.length,
    }).toStrictEqual({
      description: "First state",
      isNewHead: true,
      parentPk: updatedSkill.headVersionPk,
      resourceSha256s: new Set(["notes-demo"]),
      skillFileSha256: "skill-demo",
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

  it("stores nullable origin JSON on current Skill identity", async () => {
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
        skillFile: skillFile("v1"),
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
