import { createDb } from "@server/db/client";
import { apiKeysTable } from "@server/db/schema";
import { applyMigration } from "@server/test/migrations";
import { eq } from "drizzle-orm";
import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiKeyRepository } from "./repository";
import { ApiKeyService } from "./service";

describe("API key service", () => {
  let mf: Miniflare;
  let db: ReturnType<typeof createDb>;
  let service: ApiKeyService;

  beforeEach(async () => {
    mf = new Miniflare({
      d1Databases: { DB: "skillpack-test" },
      modules: true,
      script: "export default { fetch: () => new Response('ok') };",
    });

    const d1 = (await mf.getD1Database("DB")) as unknown as D1Database;
    await applyMigration(d1, "0002_api_keys.sql");

    db = createDb(d1);
    service = new ApiKeyService(new ApiKeyRepository(db));
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("creates a key without storing the secret", async () => {
    const created = await service.createApiKey(
      "user-a",
      {
        expiresAt: "2026-12-29T10:00:00.000Z",
        name: "Claude Desktop",
      },
      new Date("2026-06-29T10:00:00.000Z")
    );

    const rows = await db.select().from(apiKeysTable);

    expect(created.secret.startsWith("skp_")).toBeTruthy();
    expect(created.apiKey.keyHint).toContain("...");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyHash).not.toBe(created.secret);
    expect(rows[0]?.keyHint).toBe(created.apiKey.keyHint);
  });

  it("rejects keys with expiration beyond the maximum lifetime", async () => {
    await expect(
      service.createApiKey(
        "user-a",
        {
          expiresAt: "2027-06-30T10:00:01.000Z",
          name: "Long-lived client",
        },
        new Date("2026-06-29T10:00:00.000Z")
      )
    ).rejects.toThrow("API key expiration must be within one year");
  });

  it("verifies active keys and updates last used time", async () => {
    const created = await service.createApiKey(
      "user-a",
      {
        expiresAt: "2026-12-29T10:00:00.000Z",
        name: "Claude Desktop",
      },
      new Date("2026-06-29T10:00:00.000Z")
    );

    const userId = await service.verifyApiKeySecret(
      created.secret,
      new Date("2026-06-29T10:05:00.000Z")
    );
    const [row] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, created.apiKey.id));

    expect(userId).toBe("user-a");
    expect(row?.lastUsedAt?.toISOString()).toBe("2026-06-29T10:05:00.000Z");
  });

  it("throttles last used time updates", async () => {
    const created = await service.createApiKey(
      "user-a",
      {
        expiresAt: "2026-12-29T10:00:00.000Z",
        name: "Claude Desktop",
      },
      new Date("2026-06-29T10:00:00.000Z")
    );

    await service.verifyApiKeySecret(
      created.secret,
      new Date("2026-06-29T10:05:00.000Z")
    );
    await service.verifyApiKeySecret(
      created.secret,
      new Date("2026-06-29T10:30:00.000Z")
    );
    const [rowBeforeThreshold] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, created.apiKey.id));

    await service.verifyApiKeySecret(
      created.secret,
      new Date("2026-06-29T11:05:00.000Z")
    );
    const [rowAfterThreshold] = await db
      .select()
      .from(apiKeysTable)
      .where(eq(apiKeysTable.id, created.apiKey.id));

    expect(rowBeforeThreshold?.lastUsedAt?.toISOString()).toBe(
      "2026-06-29T10:05:00.000Z"
    );
    expect(rowAfterThreshold?.lastUsedAt?.toISOString()).toBe(
      "2026-06-29T11:05:00.000Z"
    );
  });

  it("rejects malformed API key secrets before lookup", async () => {
    await expect(
      service.verifyApiKeySecret(
        "skp_invalid",
        new Date("2026-06-29T10:00:00.000Z")
      )
    ).resolves.toBeUndefined();
  });

  it("rejects expired and revoked keys", async () => {
    const expired = await service.createApiKey(
      "user-a",
      {
        expiresAt: "2026-06-29T10:00:00.000Z",
        name: "Expired client",
      },
      new Date("2026-06-29T09:00:00.000Z")
    );
    const revoked = await service.createApiKey(
      "user-a",
      {
        expiresAt: "2026-12-29T10:00:00.000Z",
        name: "Revoked client",
      },
      new Date("2026-06-29T09:00:00.000Z")
    );

    await service.revokeApiKey(
      "user-a",
      revoked.apiKey.id,
      new Date("2026-06-29T09:30:00.000Z")
    );

    await expect(
      service.verifyApiKeySecret(
        expired.secret,
        new Date("2026-06-29T10:00:01.000Z")
      )
    ).resolves.toBeUndefined();
    await expect(
      service.verifyApiKeySecret(
        revoked.secret,
        new Date("2026-06-29T10:00:01.000Z")
      )
    ).resolves.toBeUndefined();
  });
});
