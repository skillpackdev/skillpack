import { digestHex, randomToken } from "@server/lib/crypto";
import type { CreateApiKeyInput } from "@skillpack/contracts/api-keys/requests";

import { apiKeyErrors } from "./errors";
import type { ApiKeyRepository } from "./repository";
import type { ApiKeyRecord, CreatedApiKey } from "./types";

const apiKeyPrefix = "skp_";
const apiKeySecretLength = 40;
const keyHintPrefixLength = 12;
const keyHintSuffixLength = 6;

const createApiKeyId = () => `key_${randomToken(24)}`;

const createApiKeySecret = () =>
  `${apiKeyPrefix}${randomToken(apiKeySecretLength)}`;

export const isSkillpackApiKeySecret = (value: string) =>
  value.startsWith(apiKeyPrefix);

const createKeyHint = (secret: string) =>
  `${secret.slice(0, keyHintPrefixLength)}...${secret.slice(-keyHintSuffixLength)}`;

export class ApiKeyService {
  private readonly repository: ApiKeyRepository;

  constructor(repository: ApiKeyRepository) {
    this.repository = repository;
  }

  async createApiKey(
    ownerUserId: string,
    input: CreateApiKeyInput,
    now = new Date()
  ): Promise<CreatedApiKey> {
    const expiresAt = new Date(input.expiresAt);

    if (expiresAt <= now) {
      throw apiKeyErrors.invalidApiKeyExpiration();
    }

    const secret = createApiKeySecret();
    const apiKey = await this.repository.createApiKey({
      createdAt: now,
      expiresAt,
      id: createApiKeyId(),
      keyHash: await digestHex(secret),
      keyHint: createKeyHint(secret),
      name: input.name,
      ownerUserId,
    });

    return { apiKey, secret };
  }

  listApiKeys(ownerUserId: string): Promise<ApiKeyRecord[]> {
    return this.repository.listApiKeys(ownerUserId);
  }

  async revokeApiKey(
    ownerUserId: string,
    apiKeyId: string,
    now = new Date()
  ): Promise<ApiKeyRecord> {
    const apiKey = await this.repository.revokeApiKey(
      ownerUserId,
      apiKeyId,
      now
    );

    if (!apiKey) {
      throw apiKeyErrors.apiKeyNotFound();
    }

    return apiKey;
  }

  async verifyApiKeySecret(
    secret: string,
    now = new Date()
  ): Promise<string | undefined> {
    if (!isSkillpackApiKeySecret(secret)) {
      return;
    }

    const apiKey = await this.repository.findApiKeyByHash(
      await digestHex(secret)
    );

    if (!apiKey) {
      return;
    }

    if (apiKey.revokedAt || apiKey.expiresAt <= now) {
      return;
    }

    await this.repository.updateLastUsedAt(apiKey.id, now);

    return apiKey.ownerUserId;
  }
}
