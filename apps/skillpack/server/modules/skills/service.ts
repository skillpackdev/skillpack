import { skillContentPath } from "@server/constants";
import { patchedValue } from "@server/lib/patch";
import type { OriginService } from "@server/modules/origins/service";
import type { OriginSkillDefinition } from "@server/modules/origins/types";
import type { SkillFileMetadata } from "@server/shared/skill-file";
import { parseSkillFile, serializeSkillFile } from "@server/shared/skill-file";
import { markdownMediaType } from "@server/shared/text-resource";

import { skillErrors } from "./errors";
import type { SkillRepository } from "./repository";
import type { ResourceManifest } from "./resource-manifest";
import type {
  CreateSkillServiceInput,
  ForkSkillServiceInput,
  ForkSkillServiceResult,
  PatchSkillResult,
  PatchSkillServiceInput,
  ReadSkillFileByNameInput,
  ReadSkillFileResult,
  ReadSkillTextFileResult,
  ResolvedSkillResult,
  SkillActivationResult,
  SkillRow,
  SkillWithCurrentResources,
  SkillVersionHistoryResult,
  SkillVersionLabelResult,
  VersionedSkillResult,
  VersionSelectorInput,
} from "./types";

const getSkillFileMetadata = (skill: SkillRow): SkillFileMetadata => ({
  allowedTools: skill.allowedTools,
  compatibility: skill.compatibility,
  description: skill.description,
  license: skill.license,
  metadata: skill.metadata,
  name: skill.name,
});

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

  listSkillsWithCurrentSkillFile() {
    return this.repository.listSkillsWithCurrentSkillFile();
  }

  listSkillsWithCurrentResources() {
    return this.repository.listSkillsWithCurrentResources();
  }

  private async resolveSkill(skillPk: number): Promise<ResolvedSkillResult> {
    const state =
      await this.repository.findSkillWithCurrentResourcesByPk(skillPk);

    if (!state) {
      throw skillErrors.skillNotFound();
    }

    return await this.resolveSkillState(state);
  }

  async resolveSkillByName(name: string): Promise<ResolvedSkillResult> {
    const state =
      await this.repository.findSkillWithCurrentResourcesByName(name);

    if (!state) {
      throw skillErrors.skillNotFound();
    }

    return await this.resolveSkillState(state);
  }

  async readSkillActivationByName(
    name: string
  ): Promise<SkillActivationResult> {
    const state =
      await this.repository.findSkillWithCurrentResourcesByName(name);

    if (!state) {
      throw skillErrors.skillNotFound();
    }

    const skillFile = await this.readSkillFileForRow(state.skill);

    return {
      resources: state.resources,
      skill: state.skill,
      skillFileContent: skillFile.content,
    };
  }

  private async resolveSkillState(
    state: SkillWithCurrentResources
  ): Promise<ResolvedSkillResult> {
    const skillFile = await this.readSkillFileForRow(state.skill);

    return {
      content: skillFile.body,
      resources: state.resources,
      skill: state.skill,
    };
  }

  async readSkillResourceByName(
    input: ReadSkillFileByNameInput
  ): Promise<ReadSkillFileResult> {
    const resource = await this.repository.findResourceByName(
      input.skillName,
      input.path
    );

    if (!resource) {
      throw skillErrors.skillFileNotFound();
    }

    const object = await this.resourceManifest.getResourceObject(resource);

    return { object, resource };
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

  async listVersionHistory(
    skillName: string
  ): Promise<SkillVersionHistoryResult> {
    return { versions: await this.repository.listVersions(skillName) };
  }

  async resolveSkillVersion(
    input: VersionSelectorInput
  ): Promise<VersionedSkillResult> {
    const { resources, skill, version } =
      await this.repository.resolveVersionResources(
        input.skillName,
        input.versionId
      );
    const skillFile = await this.readSkillFileForRow(skill);

    return {
      content: skillFile.body,
      resources,
      skill,
      version,
    };
  }

  async readSkillVersionResourceByName(
    input: VersionSelectorInput & ReadSkillFileByNameInput
  ): Promise<ReadSkillFileResult> {
    const resource = await this.repository.findVersionResourceBySelector(
      input.skillName,
      input.versionId,
      input.path
    );

    if (!resource) {
      throw skillErrors.skillFileNotFound();
    }

    const object = await this.resourceManifest.getResourceObject(resource);

    return { object, resource };
  }

  async upsertVersionLabel(
    input: VersionSelectorInput & { label: string }
  ): Promise<SkillVersionLabelResult> {
    const label = input.label.trim();

    if (!label) {
      throw skillErrors.invalidVersionLabel();
    }

    return await this.repository.upsertVersionLabel(
      input.skillName,
      input.versionId,
      label,
      new Date()
    );
  }

  async deleteVersionLabel(input: VersionSelectorInput) {
    await this.repository.deleteVersionLabel(input.skillName, input.versionId);
  }

  async restoreVersion(
    input: VersionSelectorInput
  ): Promise<ResolvedSkillResult> {
    const restoredSkill = await this.repository.restoreVersion(
      input.skillName,
      input.versionId,
      new Date()
    );

    return await this.resolveSkill(restoredSkill.pk);
  }

  async createSkill(input: CreateSkillServiceInput) {
    const now = new Date();
    const skillFileContent = serializeSkillFile(input, input.content);
    const parsedSkillFile = parseSkillFile(skillFileContent);
    const skillFile =
      await this.resourceManifest.storeSkillFile(skillFileContent);
    const resourceManifest = await this.resourceManifest.storeManifest(
      input.resources
    );

    const { skill } = await this.repository.createSkill(
      {
        name: input.name,
        resources: resourceManifest,
        skillFile,
        skillFileMetadata: {
          ...input,
          frontmatter: parsedSkillFile.frontmatter,
        },
      },
      now
    );

    return this.resolveSkill(skill.pk);
  }

  async patchSkillByName(
    name: string,
    input: PatchSkillServiceInput
  ): Promise<PatchSkillResult> {
    const state =
      await this.repository.findSkillWithCurrentResourcesByName(name);

    if (!state) {
      throw skillErrors.skillNotFound();
    }

    return await this.patchResolvedSkill(state, input);
  }

  private async patchResolvedSkill(
    state: SkillWithCurrentResources,
    input: PatchSkillServiceInput
  ): Promise<PatchSkillResult> {
    const { resources: currentResources, skill } = state;
    const nextMetadata = {
      allowedTools: patchedValue(input, "allowedTools", skill.allowedTools),
      compatibility: patchedValue(input, "compatibility", skill.compatibility),
      description: input.description ?? skill.description,
      license: patchedValue(input, "license", skill.license),
      metadata: patchedValue(input, "metadata", skill.metadata),
      name: input.name ?? skill.name,
    };
    const hasResourceChanges =
      input.deleteResourcePaths.length > 0 || input.upsertResources.length > 0;
    const hasSkillFileChanges =
      input.content !== undefined ||
      !skillFileMetadataEquals(nextMetadata, getSkillFileMetadata(skill));

    if (!(hasResourceChanges || hasSkillFileChanges)) {
      throw skillErrors.emptySkillPatch();
    }

    const { frontmatter, skillFile } = hasSkillFileChanges
      ? await this.storePatchedSkillFile(skill, nextMetadata, input)
      : {
          frontmatter: skill.frontmatter ?? {},
          skillFile: {
            mediaType: markdownMediaType,
            path: skillContentPath,
            sha256: skill.skillFileSha256,
            size: skill.skillFileSize,
          },
        };
    const resources = await this.resourceManifest.patchManifest(
      currentResources,
      input
    );
    const now = new Date();
    const updatedSkill = await this.repository.updateSkillState(
      {
        name: nextMetadata.name,
        origin: skill.origin,
        resources,
        skillFile,
        skillFileMetadata: {
          ...nextMetadata,
          frontmatter,
        },
        skillPk: skill.pk,
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

  private async storePatchedSkillFile(
    skill: SkillRow,
    metadata: SkillFileMetadata,
    input: PatchSkillServiceInput
  ) {
    const currentSkillFile = await this.readSkillFileForRow(skill);
    const skillFileContent = serializeSkillFile(
      metadata,
      input.content ?? currentSkillFile.body,
      currentSkillFile.frontmatter
    );
    const nextSkillFile = parseSkillFile(skillFileContent);
    const skillFile =
      await this.resourceManifest.storeSkillFile(skillFileContent);

    return { frontmatter: nextSkillFile.frontmatter, skillFile };
  }

  async deleteSkillByName(name: string) {
    const skill = await this.repository.findSkillByName(name);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    await this.repository.deleteSkillByPk(skill.pk);
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
    const parsedSkillFile = parseSkillFile(definition.content);
    const skillFile = await this.resourceManifest.storeSkillFile(
      definition.content
    );
    const resources = await this.resourceManifest.storeManifest(
      definition.resources
    );
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
          skillFile,
          skillFileMetadata: {
            ...definition,
            frontmatter: parsedSkillFile.frontmatter,
          },
          skillPk: existingSkill.pk,
        },
        now
      );

      return this.resolveSkill(existingSkill.pk);
    }

    const { skill } = await this.repository.createSkill(
      {
        name: definition.name,
        origin,
        resources,
        skillFile,
        skillFileMetadata: {
          ...definition,
          frontmatter: parsedSkillFile.frontmatter,
        },
      },
      now
    );

    return this.resolveSkill(skill.pk);
  }

  private async readSkillFileForRow(skill: SkillRow) {
    const object = await this.resourceManifest.getObjectBySha256(
      skill.skillFileSha256
    );
    const content = await object.text();
    const parsed = parseSkillFile(content);

    return {
      ...parsed,
      allowedTools: skill.allowedTools,
      compatibility: skill.compatibility,
      content,
      description: skill.description,
      license: skill.license,
      metadata: skill.metadata,
      name: skill.name,
    };
  }
}
