import { digestHex } from "@server/lib/crypto";
import { getDefaultMediaType, getTextSize } from "@server/shared/text-resource";

import type { StoredResourceObject, TextResourceInput } from "./types";

export const getResourceObjectKey = (sha256: string) =>
  `objects/sha256/${sha256}`;

export class SkillStorage {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async putTextResource(
    resource: TextResourceInput
  ): Promise<StoredResourceObject> {
    const mediaType = resource.mediaType ?? getDefaultMediaType(resource.path);
    const sha256 = await digestHex(resource.content);
    const objectKey = getResourceObjectKey(sha256);
    const existing = await this.bucket.head(objectKey);

    if (!existing) {
      await this.bucket.put(objectKey, resource.content, {
        customMetadata: { sha256 },
        httpMetadata: { contentType: mediaType },
      });
    }

    return {
      mediaType,
      path: resource.path,
      sha256,
      size: getTextSize(resource.content),
    };
  }

  getSkillObject(sha256: string) {
    return this.bucket.get(getResourceObjectKey(sha256));
  }
}
