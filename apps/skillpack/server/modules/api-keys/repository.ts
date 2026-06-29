import { apiKeysTable } from "@server/db/schema";
import type { Database } from "@server/types";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { ApiKeyRecord, CreateApiKeyRecordInput } from "./types";

export class ApiKeyRepository {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async createApiKey(input: CreateApiKeyRecordInput): Promise<ApiKeyRecord> {
    const [row] = await this.db.insert(apiKeysTable).values(input).returning();

    return row;
  }

  async findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | undefined> {
    const row = await this.db.query.apiKeysTable.findFirst({
      where: eq(apiKeysTable.keyHash, keyHash),
    });

    return row;
  }

  async listApiKeys(ownerUserId: string): Promise<ApiKeyRecord[]> {
    const rows = await this.db.query.apiKeysTable.findMany({
      orderBy: [desc(apiKeysTable.createdAt)],
      where: eq(apiKeysTable.ownerUserId, ownerUserId),
    });

    return rows;
  }

  async revokeApiKey(
    ownerUserId: string,
    apiKeyId: string,
    revokedAt: Date
  ): Promise<ApiKeyRecord | undefined> {
    const [row] = await this.db
      .update(apiKeysTable)
      .set({ revokedAt })
      .where(
        and(
          eq(apiKeysTable.id, apiKeyId),
          eq(apiKeysTable.ownerUserId, ownerUserId),
          isNull(apiKeysTable.revokedAt)
        )
      )
      .returning();

    return row;
  }

  async updateLastUsedAt(apiKeyId: string, lastUsedAt: Date): Promise<void> {
    await this.db
      .update(apiKeysTable)
      .set({ lastUsedAt })
      .where(eq(apiKeysTable.id, apiKeyId));
  }
}
