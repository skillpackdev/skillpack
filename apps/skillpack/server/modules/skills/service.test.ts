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
  frontmatter: null,
  headVersionPk: 10,
  license: "Apache-2.0",
  metadata: { author: "acme" },
  name: "demo",
  origin: null,
  ownerUserId: "user-a",
  pk: 1,
  skillFileSha256: "skill-md",
  skillFileSize: 120,
  updatedAt,
  versionId: "version-current",
};

const skillRow = (input?: Partial<SkillRow>): SkillRow => ({
  ...defaultSkillRow,
  ...input,
});

const resourceRow = (input?: Partial<SkillResourceRow>): SkillResourceRow => ({
  createdAt,
  mediaType: input?.mediaType ?? "text/plain; charset=utf-8",
  path: input?.path ?? "references/notes.txt",
  sha256: input?.sha256 ?? "notes",
  size: input?.size ?? 12,
  skillPk: input?.skillPk ?? 1,
  versionPk: input?.versionPk ?? 10,
});

const currentState = (input?: {
  resources?: SkillResourceRow[];
  skill?: SkillRow;
}) => ({
  resources: input?.resources ?? [resourceRow()],
  skill: input?.skill ?? skillRow(),
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
    deleteSkillByPk: vi.fn<SkillRepository["deleteSkillByPk"]>(),
    deleteVersionLabel: vi.fn<SkillRepository["deleteVersionLabel"]>(),
    findResourceByName: vi.fn<SkillRepository["findResourceByName"]>(),
    findSkillByName: vi.fn<SkillRepository["findSkillByName"]>(),
    findSkillByPk: vi.fn<SkillRepository["findSkillByPk"]>(),
    findSkillWithCurrentResourcesByName:
      vi.fn<SkillRepository["findSkillWithCurrentResourcesByName"]>(),
    findSkillWithCurrentResourcesByPk:
      vi.fn<SkillRepository["findSkillWithCurrentResourcesByPk"]>(),
    findVersionResourceBySelector:
      vi.fn<SkillRepository["findVersionResourceBySelector"]>(),
    listResourcesBySkillPk: vi.fn<SkillRepository["listResourcesBySkillPk"]>(),
    listVersions: vi.fn<SkillRepository["listVersions"]>(),
    resolveVersionResources:
      vi.fn<SkillRepository["resolveVersionResources"]>(),
    restoreVersion: vi.fn<SkillRepository["restoreVersion"]>(),
    updateSkillState: vi.fn<SkillRepository["updateSkillState"]>(),
    upsertVersionLabel: vi.fn<SkillRepository["upsertVersionLabel"]>(),
  };
  const resourceManifest = {
    getObjectBySha256: vi.fn<ResourceManifest["getObjectBySha256"]>(),
    getResourceObject: vi.fn<ResourceManifest["getResourceObject"]>(),
    patchManifest: vi.fn<ResourceManifest["patchManifest"]>(),
    storeManifest: vi.fn<ResourceManifest["storeManifest"]>(),
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

    repository.findSkillWithCurrentResourcesByName.mockReturnValue(
      Promise.resolve() as ReturnType<
        SkillRepository["findSkillWithCurrentResourcesByName"]
      >
    );

    await expect(service.resolveSkillByName("demo")).rejects.toMatchObject({
      code: "skill-not-found",
    });
    expect(repository.findSkillWithCurrentResourcesByName).toHaveBeenCalledWith(
      "demo"
    );
  });

  it("resolves a skill by the owner's Skill Name", async () => {
    const { repository, resourceManifest, service } = createService();
    const skill = skillRow({ name: "demo-skill", pk: 9 });

    repository.findSkillWithCurrentResourcesByName.mockResolvedValue(
      currentState({ skill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.resolveSkillByName("demo-skill");

    expect(result.skill).toBe(skill);
    expect(repository.findSkillWithCurrentResourcesByName).toHaveBeenCalledWith(
      "demo-skill"
    );
    expect(repository.listResourcesBySkillPk).not.toHaveBeenCalled();
  });

  it("reads activation content as the canonical SKILL.md file", async () => {
    const { repository, resourceManifest, service } = createService();
    const skill = skillRow({ name: "demo-skill", pk: 9 });

    repository.findSkillWithCurrentResourcesByName.mockResolvedValue(
      currentState({ skill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.readSkillActivationByName("demo-skill");

    expect(result.skillFileContent).toBe(skillFileContent);
    expect(result.resources).toStrictEqual([resourceRow()]);
    expect(repository.findSkillWithCurrentResourcesByName).toHaveBeenCalledWith(
      "demo-skill"
    );
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
    resourceManifest.storeManifest.mockResolvedValue(manifest);
    repository.findSkillWithCurrentResourcesByPk.mockResolvedValue(
      currentState({ skill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
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
        resources: manifest,
        skillFile: expect.objectContaining({
          path: "SKILL.md",
          sha256: "skill-md",
        }),
        skillFileMetadata: expect.objectContaining({
          description: "Demo description",
          frontmatter: expect.objectContaining({ name: "demo" }),
          name: "demo",
        }),
      }),
      expect.any(Date)
    );
  });

  it("patches metadata/body through the current Skill state", async () => {
    const { repository, resourceManifest, service } = createService();
    const currentSkill = skillRow();
    const currentResources = [resourceRow()];
    const nextResources = [
      storedResource({
        mediaType: "text/plain; charset=utf-8",
        path: "references/notes.txt",
        sha256: "notes-next",
      }),
    ];

    repository.findSkillWithCurrentResourcesByName.mockResolvedValue(
      currentState({ resources: currentResources, skill: currentSkill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );
    resourceManifest.storeSkillFile.mockResolvedValue({
      mediaType: "text/markdown; charset=utf-8",
      path: "SKILL.md",
      sha256: "next-skill-md",
      size: 140,
    });
    resourceManifest.patchManifest.mockResolvedValue(nextResources);
    repository.updateSkillState.mockResolvedValue(
      skillRow({ description: "Next description" })
    );

    await service.patchSkillByName(currentSkill.name, {
      content: "# Next\n",
      deleteResourcePaths: [],
      description: "Next description",
      upsertResources: [],
    });

    expect(repository.updateSkillState).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: nextResources,
        skillFile: expect.objectContaining({
          path: "SKILL.md",
          sha256: "next-skill-md",
        }),
        skillFileMetadata: expect.objectContaining({
          description: "Next description",
          frontmatter: expect.objectContaining({ name: "demo" }),
          name: "demo",
        }),
        skillPk: currentSkill.pk,
      }),
      expect.any(Date)
    );
  });

  it("patches attached resources without reading or rewriting SKILL.md", async () => {
    const { repository, resourceManifest, service } = createService();
    const currentSkill = skillRow({
      frontmatter: { "x-agent": "pi" },
      skillFileSha256: "current-skill-md",
      skillFileSize: 88,
    });
    const currentResources = [resourceRow()];
    const nextResources = [
      storedResource({
        path: "references/guide.md",
        sha256: "guide-next",
      }),
    ];

    repository.findSkillWithCurrentResourcesByName.mockResolvedValue(
      currentState({ resources: currentResources, skill: currentSkill })
    );
    resourceManifest.patchManifest.mockResolvedValue(nextResources);
    repository.updateSkillState.mockResolvedValue(currentSkill);

    await service.patchSkillByName(currentSkill.name, {
      deleteResourcePaths: [],
      upsertResources: [
        {
          content: "guide",
          path: "references/guide.md",
        },
      ],
    });

    expect(resourceManifest.getObjectBySha256).not.toHaveBeenCalled();
    expect(resourceManifest.storeSkillFile).not.toHaveBeenCalled();
    expect(repository.updateSkillState).toHaveBeenCalledWith(
      expect.objectContaining({
        resources: nextResources,
        skillFile: expect.objectContaining({
          path: "SKILL.md",
          sha256: "current-skill-md",
          size: 88,
        }),
        skillFileMetadata: expect.objectContaining({
          frontmatter: { "x-agent": "pi" },
        }),
      }),
      expect.any(Date)
    );
  });

  it("rejects patches that do not change Skill state or resources", async () => {
    const { repository, resourceManifest, service } = createService();
    const currentSkill = skillRow();

    repository.findSkillWithCurrentResourcesByName.mockResolvedValue(
      currentState({ skill: currentSkill })
    );

    await expect(
      service.patchSkillByName(currentSkill.name, {
        deleteResourcePaths: [],
        upsertResources: [],
      })
    ).rejects.toMatchObject({ code: "empty-skill-patch" });

    expect(resourceManifest.storeSkillFile).not.toHaveBeenCalled();
  });

  it("lists Skill Version History", async () => {
    const { repository, service } = createService();

    repository.listVersions.mockResolvedValue([
      {
        createdAt: new Date("2026-05-25T12:01:00.000Z"),
        id: "version-two",
        label: "Known good",
      },
    ]);

    await expect(service.listVersionHistory("demo")).resolves.toStrictEqual({
      versions: [
        {
          createdAt: new Date("2026-05-25T12:01:00.000Z"),
          id: "version-two",
          label: "Known good",
        },
      ],
    });
    expect(repository.listVersions).toHaveBeenCalledWith("demo");
  });

  it("resolves a historical Skill Version", async () => {
    const { repository, resourceManifest, service } = createService();
    const skill = skillRow({
      description: "Historical description",
      skillFileSha256: "historical-skill-md",
    });
    const resource = resourceRow({
      path: "references/notes.txt",
      sha256: "historical-notes",
    });

    repository.resolveVersionResources.mockResolvedValue({
      resources: [resource],
      skill,
      version: {
        createdAt,
        description: skill.description,
        frontmatter: skill.frontmatter,
        id: "version-one",
        parentPk: null,
        pk: skill.headVersionPk,
        resourceManifest: [resource],
        skillFileSha256: skill.skillFileSha256,
        skillFileSize: skill.skillFileSize,
        skillPk: skill.pk,
      },
    });
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.resolveSkillVersion({
      skillName: "demo",
      versionId: "version-one",
    });

    expect(result.content.trimStart()).toBe("# Demo\n");
    expect(result.version.id).toBe("version-one");
    expect(repository.resolveVersionResources).toHaveBeenCalledWith(
      "demo",
      "version-one"
    );
  });

  it("validates Skill Version Label writes", async () => {
    const { repository, service } = createService();

    await expect(
      service.upsertVersionLabel({
        label: "   ",
        skillName: "demo",
        versionId: "current",
      })
    ).rejects.toMatchObject({ code: "invalid-version-label" });

    await service.upsertVersionLabel({
      label: " Known good ",
      skillName: "demo",
      versionId: "current",
    });

    expect(repository.upsertVersionLabel).toHaveBeenCalledWith(
      "demo",
      "current",
      "Known good",
      expect.any(Date)
    );
  });

  it("restores a historical Skill Version", async () => {
    const { repository, resourceManifest, service } = createService();
    const restoredSkill = skillRow({ description: "Restored" });

    repository.restoreVersion.mockResolvedValue(restoredSkill);
    repository.findSkillWithCurrentResourcesByPk.mockResolvedValue(
      currentState({ skill: restoredSkill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.restoreVersion({
      skillName: "demo",
      versionId: "version-one",
    });

    expect(result.skill).toBe(restoredSkill);
    expect(repository.restoreVersion).toHaveBeenCalledWith(
      "demo",
      "version-one",
      expect.any(Date)
    );
  });

  it("adds a source skill with an existing name by appending a new version", async () => {
    const { originService, repository, resourceManifest, service } =
      createService();
    const existingSkill = skillRow({ name: "demo", pk: 7 });

    originService.readSkillDefinitions.mockResolvedValue([
      { definition: originDefinition(), status: "resolved" },
    ]);
    repository.findSkillByName.mockResolvedValue(existingSkill);
    resourceManifest.storeSkillFile.mockResolvedValue(
      storedResource({ path: "SKILL.md" })
    );
    resourceManifest.storeManifest.mockResolvedValue([]);
    repository.updateSkillState.mockResolvedValue(existingSkill);
    repository.findSkillWithCurrentResourcesByPk.mockResolvedValue(
      currentState({ skill: existingSkill })
    );
    resourceManifest.getObjectBySha256.mockResolvedValue(
      objectWithText(skillFileContent)
    );

    const result = await service.forkSkill({
      origin: { kind: "github", repoUrl: "https://github.com/example/skills" },
      selections: [{ skillName: "demo" }],
    });

    expect(result.results[0]).toMatchObject({ status: "forked" });
    expect(repository.updateSkillState).toHaveBeenCalledWith(
      expect.objectContaining({ skillPk: existingSkill.pk }),
      expect.any(Date)
    );
  });
});
