import type { OriginService } from "@server/modules/origins/service";
import { describe, expect, it, vi } from "vitest";

import type { SkillRepository } from "./repository";
import type { ResourceManifest } from "./resource-manifest";
import { SkillService } from "./service";
import type { SkillResourceRow, SkillRow, StoredResourceObject } from "./types";

const createdAt = new Date("2026-05-25T12:00:00.000Z");
const updatedAt = new Date("2026-05-25T12:01:00.000Z");

const skillFileContent = `---
name: demo
description: Demo description
license: Apache-2.0
metadata:
  author: acme
allowed-tools: Read
---

# Demo
`;

const defaultSkillRow: SkillRow = {
  allowedTools: "Read",
  compatibility: null,
  createdAt,
  description: "Demo description",
  headVersionId: 10,
  id: 1,
  license: "Apache-2.0",
  metadata: { author: "acme" },
  name: "demo",
  origin: null,
  ownerUserId: "user-a",
  updatedAt,
};

const skillRow = (input?: Partial<SkillRow>): SkillRow => ({
  ...defaultSkillRow,
  ...input,
});

const resourceRow = (input?: Partial<SkillResourceRow>): SkillResourceRow => ({
  createdAt,
  id: input?.id ?? 100,
  mediaType: input?.mediaType ?? "text/markdown; charset=utf-8",
  path: input?.path ?? "SKILL.md",
  sha256: input?.sha256 ?? "skill-md",
  size: input?.size ?? 120,
  skillId: input?.skillId ?? 1,
  versionId: input?.versionId ?? 10,
});

const storedResource = (
  input?: Partial<StoredResourceObject>
): StoredResourceObject => ({
  mediaType: input?.mediaType ?? "text/plain; charset=utf-8",
  path: input?.path ?? "references/notes.txt",
  sha256: input?.sha256 ?? "notes",
  size: input?.size ?? 12,
});

const objectWithText = (text: string) =>
  ({
    size: text.length,
    text: () => Promise.resolve(text),
  }) as R2ObjectBody;

const missingSkill = null as unknown as Awaited<
  ReturnType<SkillRepository["findSkillById"]>
>;

const originDefinition = (input?: {
  content?: string;
  name?: string;
  selectionName?: string;
}) => ({
  allowedTools: "Read",
  compatibility: null,
  content: input?.content ?? skillFileContent,
  description: "Forked description",
  license: null,
  metadata: null,
  name: input?.name ?? "demo",
  provenance: {
    kind: "github" as const,
    metadata: { resolvedSkillPath: "skills/demo/SKILL.md" },
    url: "https://github.com/example/skills",
  },
  resources: [],
  selection: { skillName: input?.selectionName ?? input?.name ?? "demo" },
});

const createService = () => {
  const repository = {
    createSkill: vi.fn<SkillRepository["createSkill"]>(),
    deleteSkillById: vi.fn<SkillRepository["deleteSkillById"]>(),
    findResourceByPath: vi.fn<SkillRepository["findResourceByPath"]>(),
    findSkillById: vi.fn<SkillRepository["findSkillById"]>(),
    findSkillByName: vi.fn<SkillRepository["findSkillByName"]>(),
    listResourcesBySkillId: vi.fn<SkillRepository["listResourcesBySkillId"]>(),
    updateSkillState: vi.fn<SkillRepository["updateSkillState"]>(),
  };
  const resourceManifest = {
    createSnapshot: vi.fn<ResourceManifest["createSnapshot"]>(),
    getObjectBySha256: vi.fn<ResourceManifest["getObjectBySha256"]>(),
    getResourceObject: vi.fn<ResourceManifest["getResourceObject"]>(),
    patchSnapshot: vi.fn<ResourceManifest["patchSnapshot"]>(),
    storeSkillFile: vi.fn<ResourceManifest["storeSkillFile"]>(),
  };
  const originService = {
    readSkillDefinitions: vi.fn<OriginService["readSkillDefinitions"]>(),
  };

  return {
    originService,
    repository,
    resourceManifest,
    service: new SkillService(
      repository as unknown as SkillRepository,
      resourceManifest as unknown as ResourceManifest,
      originService as unknown as OriginService
    ),
  };
};

describe("SkillService current-state lifecycle", () => {
  it("treats skills outside the owner scope as not found", async () => {
    const { repository, service } = createService();

    repository.findSkillById.mockResolvedValue(missingSkill);

    await expect(service.resolveSkill(1)).rejects.toMatchObject({
      code: "skill-not-found",
    });
    expect(repository.findSkillById).toHaveBeenCalledWith(1);
  });

  it("resolves a skill by the owner's Skill Name", async () => {
    const { repository, resourceManifest, service } = createService();
    const skill = skillRow({ id: 9, name: "demo-skill" });

    repository.findSkillByName.mockResolvedValue(skill);
    repository.listResourcesBySkillId.mockResolvedValue([resourceRow()]);
    resourceManifest.getResourceObject.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.resolveSkillByName("demo-skill");

    expect(result.skill).toBe(skill);
    expect(repository.findSkillByName).toHaveBeenCalledWith("demo-skill");
    expect(repository.listResourcesBySkillId).toHaveBeenCalledWith(9);
  });

  it("serializes canonical SKILL.md before creating current Skill state", async () => {
    const { repository, resourceManifest, service } = createService();
    const skill = skillRow();
    const manifest = [storedResource()];

    repository.createSkill.mockResolvedValue({ skill });
    resourceManifest.storeSkillFile.mockResolvedValue({
      mediaType: "text/markdown; charset=utf-8",
      path: "SKILL.md",
      sha256: "skill-md",
      size: 120,
    });
    resourceManifest.createSnapshot.mockResolvedValue(manifest);
    repository.findSkillById.mockResolvedValue(skill);
    repository.listResourcesBySkillId.mockResolvedValue([resourceRow()]);
    resourceManifest.getResourceObject.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    await service.createSkill({
      allowedTools: "Read",
      compatibility: null,
      content: "# Demo\n",
      description: "Demo description",
      license: "Apache-2.0",
      metadata: { author: "acme" },
      name: "demo",
      resources: [],
    });

    expect(resourceManifest.storeSkillFile).toHaveBeenCalledWith(
      expect.stringContaining("allowed-tools: Read")
    );
    expect(repository.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "demo",
        resources: [
          expect.objectContaining({ path: "SKILL.md", sha256: "skill-md" }),
          ...manifest,
        ],
        skillFileMetadata: expect.objectContaining({
          description: "Demo description",
          name: "demo",
        }),
      }),
      expect.any(Date)
    );
  });

  it("patches metadata/body through the current Skill state", async () => {
    const { repository, resourceManifest, service } = createService();
    const currentSkill = skillRow();
    const currentResources = [
      resourceRow(),
      resourceRow({
        id: 101,
        mediaType: "text/plain; charset=utf-8",
        path: "references/notes.txt",
        sha256: "notes",
        size: 12,
      }),
    ];
    const nextResources = [
      storedResource({
        mediaType: "text/plain; charset=utf-8",
        path: "references/notes.txt",
        sha256: "notes-next",
      }),
    ];

    repository.findSkillById.mockResolvedValue(currentSkill);
    repository.listResourcesBySkillId.mockResolvedValue(currentResources);
    resourceManifest.getResourceObject.mockResolvedValue(
      objectWithText(skillFileContent)
    );
    resourceManifest.storeSkillFile.mockResolvedValue({
      mediaType: "text/markdown; charset=utf-8",
      path: "SKILL.md",
      sha256: "next-skill-md",
      size: 140,
    });
    resourceManifest.patchSnapshot.mockResolvedValue(nextResources);
    repository.updateSkillState.mockResolvedValue(
      skillRow({ description: "Next description" })
    );

    await service.patchSkill(currentSkill.id, {
      content: "# Next\n",
      deleteResourcePaths: [],
      description: "Next description",
      upsertResources: [],
    });

    expect(repository.updateSkillState).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: [
          expect.objectContaining({
            path: "SKILL.md",
            sha256: "next-skill-md",
          }),
          ...nextResources,
        ],
        skillFileMetadata: expect.objectContaining({
          description: "Next description",
          name: "demo",
        }),
        skillId: currentSkill.id,
      }),
      expect.any(Date)
    );
  });

  it("rejects patches that do not change Skill state or resources", async () => {
    const { repository, resourceManifest, service } = createService();
    const currentSkill = skillRow();

    repository.findSkillById.mockResolvedValue(currentSkill);
    repository.listResourcesBySkillId.mockResolvedValue([resourceRow()]);
    resourceManifest.getResourceObject.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    await expect(
      service.patchSkill(currentSkill.id, {
        deleteResourcePaths: [],
        upsertResources: [],
      })
    ).rejects.toMatchObject({ code: "empty-skill-patch" });

    expect(resourceManifest.storeSkillFile).not.toHaveBeenCalled();
  });

  it("adds a source skill with an existing name by appending a new version", async () => {
    const { originService, repository, resourceManifest, service } =
      createService();
    const existingSkill = skillRow({ id: 7, name: "demo" });

    originService.readSkillDefinitions.mockResolvedValue([
      { definition: originDefinition(), status: "resolved" },
    ]);
    repository.findSkillByName.mockResolvedValue(existingSkill);
    repository.listResourcesBySkillId.mockResolvedValue([resourceRow()]);
    resourceManifest.storeSkillFile.mockResolvedValue(
      storedResource({ path: "SKILL.md" })
    );
    resourceManifest.createSnapshot.mockResolvedValue([]);
    repository.updateSkillState.mockResolvedValue(existingSkill);
    repository.findSkillById.mockResolvedValue(existingSkill);
    resourceManifest.getResourceObject.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.forkSkill({
      origin: { kind: "github", repoUrl: "https://github.com/example/skills" },
      selections: [{ skillName: "demo" }],
    });

    expect(result.results[0]).toMatchObject({ status: "forked" });
    expect(repository.updateSkillState).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: existingSkill.id }),
      expect.any(Date)
    );
  });
});
