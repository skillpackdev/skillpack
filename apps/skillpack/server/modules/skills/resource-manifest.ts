import { skillContentPath } from "@server/constants";
import { markdownMediaType } from "@server/shared/text-resource";

import { skillErrors } from "./errors";
import type { SkillStorage } from "./storage";
import type {
  PatchSkillServiceInput,
  SkillResourceRow,
  StoredResourceObject,
  TextResourceInput,
} from "./types";

const containsSkillContentPath = (path: string) =>
  path.split("/").includes(skillContentPath);

const validateResourcePaths = (resources: TextResourceInput[]) => {
  const resourcePaths = new Set(resources.map((resource) => resource.path));

  if (resourcePaths.size !== resources.length) {
    throw skillErrors.duplicateResourcePath();
  }

  if ([...resourcePaths].some(containsSkillContentPath)) {
    throw skillErrors.reservedResourcePath();
  }
};

const toStoredResource = (
  resource: SkillResourceRow
): StoredResourceObject => ({
  mediaType: resource.mediaType,
  path: resource.path,
  sha256: resource.sha256,
  size: resource.size,
});

export class ResourceManifest {
  private readonly storage: SkillStorage;

  constructor(storage: SkillStorage) {
    this.storage = storage;
  }

  async storeManifest(
    resources: TextResourceInput[]
  ): Promise<StoredResourceObject[]> {
    validateResourcePaths(resources);

    return await Promise.all(
      resources.map((resource) => this.storage.putTextResource(resource))
    );
  }

  storeSkillFile(content: string): Promise<StoredResourceObject> {
    return this.storage.putTextResource({
      content,
      mediaType: markdownMediaType,
      path: skillContentPath,
    });
  }

  async patchManifest(
    currentResources: SkillResourceRow[],
    input: PatchSkillServiceInput
  ): Promise<StoredResourceObject[]> {
    const nextResources = new Map<string, StoredResourceObject>();

    for (const resource of currentResources) {
      nextResources.set(resource.path, toStoredResource(resource));
    }

    if (input.deleteResourcePaths.includes(skillContentPath)) {
      throw skillErrors.reservedResourcePath();
    }

    for (const path of input.deleteResourcePaths) {
      nextResources.delete(path);
    }

    validateResourcePaths(input.upsertResources);

    const upsertedResources = await Promise.all(
      input.upsertResources.map((resource) =>
        this.storage.putTextResource(resource)
      )
    );

    for (const resource of upsertedResources) {
      nextResources.set(resource.path, resource);
    }

    return [...nextResources.values()];
  }

  getResourceObject(resource: { sha256: string }) {
    return this.getObjectBySha256(resource.sha256);
  }

  async getObjectBySha256(sha256: string) {
    const object = await this.storage.getSkillObject(sha256);

    if (!object) {
      throw skillErrors.skillObjectNotFound();
    }

    return object;
  }
}
