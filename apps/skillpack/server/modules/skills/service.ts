import { skillContentPath } from "@server/constants";
import type { OriginService } from "@server/modules/origins/service";
import type { OriginSkillDefinition } from "@server/modules/origins/types";
import type { SkillFileMetadata } from "@server/shared/skill-file";
import { parseSkillFile, serializeSkillFile } from "@server/shared/skill-file";

import { skillErrors } from "./errors";
import type { SkillRepository } from "./repository";
import { ResourceManifest } from "./resource-manifest";
import type {
  CreateSkillServiceInput,
  ForkSkillServiceInput,
  ForkSkillServiceResult,
  PatchSkillResult,
  PatchSkillServiceInput,
  ReadSkillFileByNameInput,
  ReadSkillFileInput,
  ReadSkillFileResult,
  ReadSkillTextFileResult,
  ResolvedSkillResult,
  SkillResourceRow,
  SkillRow,
} from "./types";

const getSkillFileMetadata = (skill: SkillRow): SkillFileMetadata => ({
  allowedTools: skill.allowedTools,
  compatibility: skill.compatibility,
  description: skill.description,
  license: skill.license,
  metadata: skill.metadata,
  name: skill.name,
});

const patchValue = <T>(
  input: Record<string, unknown>,
  key: string,
  current: T
) => (Object.hasOwn(input, key) ? (input[key] as T) : current);

const metadataEquals = (
  left: Record<string, string> | null | undefined,
  right: Record<string, string> | null | undefined
) => {
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});

  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value]) => right?.[key] === value)
  );
};

const skillFileMetadataEquals = (
  left: SkillFileMetadata,
  right: SkillFileMetadata
) =>
  left.allowedTools === right.allowedTools &&
  left.compatibility === right.compatibility &&
  left.description === right.description &&
  left.license === right.license &&
  metadataEquals(left.metadata, right.metadata) &&
  left.name === right.name;

export class SkillService {
  private readonly repository: SkillRepository;

  private readonly originService: OriginService;

  private readonly resourceManifest: ResourceManifest;

  constructor(
    repository: SkillRepository,
    resourceManifest: ResourceManifest,
    originService: OriginService
  ) {
    this.repository = repository;
    this.originService = originService;
    this.resourceManifest = resourceManifest;
  }

  listSkills() {
    return this.repository.listSkills();
  }

  async resolveSkill(skillId: number): Promise<ResolvedSkillResult> {
    const skill = await this.repository.findSkillById(skillId);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    return await this.resolveCurrentSkill(skill);
  }

  async resolveSkillByName(name: string): Promise<ResolvedSkillResult> {
    const skill = await this.repository.findSkillByName(name);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    return await this.resolveCurrentSkill(skill);
  }

  private async resolveCurrentSkill(
    skill: SkillRow
  ): Promise<ResolvedSkillResult> {
    const resources = await this.repository.listResourcesBySkillId(skill.id);
    const manifest = ResourceManifest.resolveSnapshot(resources);
    const skillFile = await this.readCurrentSkillFile(
      skill,
      manifest.resources
    );

    return {
      content: skillFile.body,
      resources: manifest.resources,
      skill,
    };
  }

  async readSkillResource(
    input: ReadSkillFileInput
  ): Promise<ReadSkillFileResult> {
    const skill = await this.repository.findSkillById(input.skillId);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    const resource = await this.repository.findResourceByPath(
      skill.id,
      input.path
    );

    if (!resource) {
      throw skillErrors.skillFileNotFound();
    }

    const object = await this.resourceManifest.getResourceObject(resource);

    return { object, resource };
  }

  async readSkillTextFile(
    input: ReadSkillFileInput
  ): Promise<ReadSkillTextFileResult> {
    const result = await this.readSkillResource(input);

    return {
      content: await result.object.text(),
      resource: result.resource,
    };
  }

  async readSkillResourceByName(
    input: ReadSkillFileByNameInput
  ): Promise<ReadSkillFileResult> {
    const skill = await this.repository.findSkillByName(input.skillName);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    return await this.readSkillResource({
      path: input.path,
      skillId: skill.id,
    });
  }

  async readSkillTextFileByName(
    input: ReadSkillFileByNameInput
  ): Promise<ReadSkillTextFileResult> {
    const result = await this.readSkillResourceByName(input);

    return {
      content: await result.object.text(),
      resource: result.resource,
    };
  }

  async createSkill(input: CreateSkillServiceInput) {
    const now = new Date();
    const skillFileContent = serializeSkillFile(input, input.content);
    const skillFile =
      await this.resourceManifest.storeSkillFile(skillFileContent);
    const resourceManifest = await this.resourceManifest.createSnapshot(
      input.resources
    );
    const resources = [skillFile, ...resourceManifest];

    const { skill } = await this.repository.createSkill(
      {
        name: input.name,
        resources,
        skillFileMetadata: input,
      },
      now
    );

    return this.resolveSkill(skill.id);
  }

  async patchSkill(
    skillId: number,
    input: PatchSkillServiceInput
  ): Promise<PatchSkillResult> {
    const skill = await this.repository.findSkillById(skillId);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    return await this.patchResolvedSkill(skill, input);
  }

  async patchSkillByName(
    name: string,
    input: PatchSkillServiceInput
  ): Promise<PatchSkillResult> {
    const skill = await this.repository.findSkillByName(name);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    return await this.patchResolvedSkill(skill, input);
  }

  private async patchResolvedSkill(
    skill: SkillRow,
    input: PatchSkillServiceInput
  ): Promise<PatchSkillResult> {
    const currentResources = await this.repository.listResourcesBySkillId(
      skill.id
    );
    const currentSkillFile = await this.readCurrentSkillFile(
      skill,
      currentResources
    );
    const nextMetadata = {
      allowedTools: patchValue(input, "allowedTools", skill.allowedTools),
      compatibility: patchValue(input, "compatibility", skill.compatibility),
      description: input.description ?? skill.description,
      license: patchValue(input, "license", skill.license),
      metadata: patchValue(input, "metadata", skill.metadata),
      name: input.name ?? skill.name,
    };
    const nextBody = input.content ?? currentSkillFile.body;
    const hasResourceChanges =
      input.deleteResourcePaths.length > 0 || input.upsertResources.length > 0;

    if (
      !hasResourceChanges &&
      nextBody === currentSkillFile.body &&
      skillFileMetadataEquals(nextMetadata, getSkillFileMetadata(skill))
    ) {
      throw skillErrors.emptySkillPatch();
    }

    const skillFileContent = serializeSkillFile(
      nextMetadata,
      nextBody,
      currentSkillFile.frontmatter
    );
    const skillFile =
      await this.resourceManifest.storeSkillFile(skillFileContent);
    const resourceManifest = await this.resourceManifest.patchSnapshot(
      currentResources,
      input
    );
    const resources = [
      skillFile,
      ...resourceManifest.filter(
        (resource) => resource.path !== skillContentPath
      ),
    ];
    const now = new Date();
    const updatedSkill = await this.repository.updateSkillState(
      {
        name: nextMetadata.name,
        origin: skill.origin,
        resources,
        skillFileMetadata: nextMetadata,
        skillId: skill.id,
      },
      now
    );

    return {
      allowedTools: updatedSkill.allowedTools,
      compatibility: updatedSkill.compatibility,
      description: updatedSkill.description,
      license: updatedSkill.license,
      metadata: updatedSkill.metadata,
      name: updatedSkill.name,
    };
  }

  async deleteSkill(skillId: number) {
    const skill = await this.repository.findSkillById(skillId);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    await this.repository.deleteSkillById(skill.id);
  }

  async deleteSkillByName(name: string) {
    const skill = await this.repository.findSkillByName(name);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    await this.repository.deleteSkillById(skill.id);
  }

  async forkSkill(
    input: ForkSkillServiceInput
  ): Promise<ForkSkillServiceResult> {
    const definitions = await this.originService.readSkillDefinitions(
      input.origin,
      input.selections
    );
    const results: ForkSkillServiceResult["results"] = [];
    const resolvedSkillNames = new Set<string>();

    for (const definitionResult of definitions) {
      if (definitionResult.status === "failed") {
        results.push(definitionResult);
        continue;
      }

      if (resolvedSkillNames.has(definitionResult.definition.name)) {
        results.push({
          error: skillErrors.duplicateResolvedSkillName().message,
          selection: definitionResult.definition.selection,
          status: "failed",
        });
        continue;
      }

      resolvedSkillNames.add(definitionResult.definition.name);

      try {
        results.push({
          selection: definitionResult.definition.selection,
          skill: await this.forkSkillDefinition(definitionResult.definition),
          status: "forked",
        });
      } catch (error) {
        results.push({
          error: error instanceof Error ? error.message : "Fork failed",
          selection: definitionResult.definition.selection,
          status: "failed",
        });
      }
    }

    return { results };
  }

  private async forkSkillDefinition(definition: OriginSkillDefinition) {
    const now = new Date();
    const existingSkill = await this.repository.findSkillByName(
      definition.name
    );
    const skillFile = await this.resourceManifest.storeSkillFile(
      definition.content
    );
    const resourceManifest = await this.resourceManifest.createSnapshot(
      definition.resources
    );
    const resources = [skillFile, ...resourceManifest];
    const origin = {
      kind: definition.provenance.kind,
      metadata: definition.provenance.metadata,
      url: definition.provenance.url,
    };

    if (existingSkill) {
      await this.repository.updateSkillState(
        {
          name: definition.name,
          origin,
          resources,
          skillFileMetadata: definition,
          skillId: existingSkill.id,
        },
        now
      );

      return this.resolveSkill(existingSkill.id);
    }

    const { skill } = await this.repository.createSkill(
      {
        name: definition.name,
        origin,
        resources,
        skillFileMetadata: definition,
      },
      now
    );

    return this.resolveSkill(skill.id);
  }

  private async readCurrentSkillFile(
    skill: SkillRow,
    resources: SkillResourceRow[]
  ) {
    const skillFileResource = resources.find(
      (resource) => resource.path === skillContentPath
    );

    if (!skillFileResource) {
      throw skillErrors.skillFileNotFound();
    }

    const object =
      await this.resourceManifest.getResourceObject(skillFileResource);
    const parsed = parseSkillFile(await object.text());

    return {
      ...parsed,
      allowedTools: skill.allowedTools,
      compatibility: skill.compatibility,
      description: skill.description,
      license: skill.license,
      metadata: skill.metadata,
      name: skill.name,
    };
  }
}
