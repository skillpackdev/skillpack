export interface ApiKeyRecord {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  keyHash: string;
  keyHint: string;
  lastUsedAt: Date | null;
  name: string;
  ownerUserId: string;
  revokedAt: Date | null;
}

export interface CreateApiKeyRecordInput {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  keyHash: string;
  keyHint: string;
  name: string;
  ownerUserId: string;
}

export interface CreatedApiKey {
  apiKey: ApiKeyRecord;
  secret: string;
}
