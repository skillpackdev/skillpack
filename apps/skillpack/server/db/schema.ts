import type { SkillOriginJson } from "@skillpack/contracts/skills/state";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const skillsTable = sqliteTable(
  "skills",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    headVersionPk: integer("head_version_pk").notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    pk: integer("pk").primaryKey({ autoIncrement: true }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    skillOwnerNameUnique: uniqueIndex("skills_owner_name_unique").on(
      table.ownerUserId,
      table.name
    ),
  })
);

export const skillVersionsTable = sqliteTable(
  "skill_versions",
  {
    allowedTools: text("allowed_tools"),
    compatibility: text("compatibility"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    description: text("description").notNull(),
    id: text("id").notNull(),
    license: text("license"),
    metadata: text("metadata", { mode: "json" }).$type<Record<
      string,
      string
    > | null>(),
    origin: text("origin", { mode: "json" }).$type<SkillOriginJson | null>(),
    parentPk: integer("parent_pk"),
    pk: integer("pk").primaryKey({ autoIncrement: true }),
    skillPk: integer("skill_pk").notNull(),
  },
  (table) => ({
    skillVersionIdUnique: uniqueIndex("skill_versions_id_unique").on(table.id),
    skillVersionParentIndex: index("skill_versions_parent_idx").on(
      table.parentPk
    ),
    skillVersionSkillIndex: index("skill_versions_skill_idx").on(table.skillPk),
  })
);

export const skillVersionResourcesTable = sqliteTable(
  "skill_version_resources",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    mediaType: text("media_type").notNull(),
    path: text("path").notNull(),
    sha256: text("sha256").notNull(),
    size: integer("size").notNull(),
    versionPk: integer("version_pk").notNull(),
  },
  (table) => ({
    skillVersionResourceShaIndex: index("skill_version_resources_sha_idx").on(
      table.sha256
    ),
    skillVersionResourceVersionIndex: index(
      "skill_version_resources_version_idx"
    ).on(table.versionPk),
    skillVersionResourceVersionPathUnique: uniqueIndex(
      "skill_version_resources_version_path_unique"
    ).on(table.versionPk, table.path),
  })
);

export const skillVersionLabelsTable = sqliteTable(
  "skill_version_labels",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").notNull(),
    label: text("label").notNull(),
    pk: integer("pk").primaryKey({ autoIncrement: true }),
    skillPk: integer("skill_pk").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    versionPk: integer("version_pk").notNull(),
  },
  (table) => ({
    skillVersionLabelIdUnique: uniqueIndex("skill_version_labels_id_unique").on(
      table.id
    ),
    skillVersionLabelSkillVersionUnique: uniqueIndex(
      "skill_version_labels_skill_version_unique"
    ).on(table.skillPk, table.versionPk),
    skillVersionLabelVersionIndex: index("skill_version_labels_version_idx").on(
      table.versionPk
    ),
  })
);

export const skillsRelations = relations(skillsTable, ({ many, one }) => ({
  headVersion: one(skillVersionsTable, {
    fields: [skillsTable.headVersionPk],
    references: [skillVersionsTable.pk],
  }),
  labels: many(skillVersionLabelsTable),
  versions: many(skillVersionsTable),
}));

export const skillVersionsRelations = relations(
  skillVersionsTable,
  ({ many, one }) => ({
    label: one(skillVersionLabelsTable, {
      fields: [skillVersionsTable.pk],
      references: [skillVersionLabelsTable.versionPk],
    }),
    resources: many(skillVersionResourcesTable),
    skill: one(skillsTable, {
      fields: [skillVersionsTable.skillPk],
      references: [skillsTable.pk],
    }),
  })
);

export const skillVersionResourcesRelations = relations(
  skillVersionResourcesTable,
  ({ one }) => ({
    version: one(skillVersionsTable, {
      fields: [skillVersionResourcesTable.versionPk],
      references: [skillVersionsTable.pk],
    }),
  })
);

export const skillVersionLabelsRelations = relations(
  skillVersionLabelsTable,
  ({ one }) => ({
    skill: one(skillsTable, {
      fields: [skillVersionLabelsTable.skillPk],
      references: [skillsTable.pk],
    }),
    version: one(skillVersionsTable, {
      fields: [skillVersionLabelsTable.versionPk],
      references: [skillVersionsTable.pk],
    }),
  })
);

export const apiKeysTable = sqliteTable(
  "api_keys",
  {
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey().notNull(),
    keyHash: text("key_hash").notNull(),
    keyHint: text("key_hint").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => ({
    apiKeyHashUnique: uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
    apiKeyOwnerIndex: index("api_keys_owner_user_id_idx").on(table.ownerUserId),
  })
);

export const jwksTable = sqliteTable("jwks", {
  createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
  id: text("id").primaryKey().notNull(),
  privateKey: text("privateKey").notNull(),
  publicKey: text("publicKey").notNull(),
});

export const oauthClientTable = sqliteTable(
  "oauthClient",
  {
    clientId: text("clientId").notNull(),
    clientSecret: text("clientSecret"),
    contacts: text("contacts", { mode: "json" }).$type<string[] | null>(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    disabled: integer("disabled", { mode: "boolean" }),
    enableEndSession: integer("enableEndSession", { mode: "boolean" }),
    grantTypes: text("grantTypes", { mode: "json" }).$type<string[] | null>(),
    icon: text("icon"),
    id: text("id").primaryKey().notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<
      string,
      unknown
    > | null>(),
    name: text("name"),
    policy: text("policy"),
    postLogoutRedirectUris: text("postLogoutRedirectUris", {
      mode: "json",
    }).$type<string[] | null>(),
    public: integer("public", { mode: "boolean" }),
    redirectUris: text("redirectUris", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    referenceId: text("referenceId"),
    requirePKCE: integer("requirePKCE", { mode: "boolean" }),
    responseTypes: text("responseTypes", { mode: "json" }).$type<
      string[] | null
    >(),
    scopes: text("scopes", { mode: "json" }).$type<string[] | null>(),
    skipConsent: integer("skipConsent", { mode: "boolean" }),
    softwareId: text("softwareId"),
    softwareStatement: text("softwareStatement"),
    softwareVersion: text("softwareVersion"),
    subjectType: text("subjectType"),
    tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
    tos: text("tos"),
    type: text("type"),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
    uri: text("uri"),
    userId: text("userId"),
  },
  (table) => ({
    oauthClientClientIdUnique: uniqueIndex("oauthClient_clientId_unique").on(
      table.clientId
    ),
    oauthClientUserIdIndex: index("oauthClient_userId_idx").on(table.userId),
  })
);

export const oauthRefreshTokenTable = sqliteTable(
  "oauthRefreshToken",
  {
    authTime: integer("authTime", { mode: "timestamp_ms" }),
    clientId: text("clientId").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    id: text("id").primaryKey().notNull(),
    referenceId: text("referenceId"),
    revoked: integer("revoked", { mode: "timestamp_ms" }),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    sessionId: text("sessionId"),
    token: text("token").notNull(),
    userId: text("userId").notNull(),
  },
  (table) => ({
    oauthRefreshTokenClientIdIndex: index("oauthRefreshToken_clientId_idx").on(
      table.clientId
    ),
    oauthRefreshTokenSessionIdIndex: index(
      "oauthRefreshToken_sessionId_idx"
    ).on(table.sessionId),
    oauthRefreshTokenTokenUnique: uniqueIndex(
      "oauthRefreshToken_token_unique"
    ).on(table.token),
    oauthRefreshTokenUserIdIndex: index("oauthRefreshToken_userId_idx").on(
      table.userId
    ),
  })
);

export const oauthAccessTokenTable = sqliteTable(
  "oauthAccessToken",
  {
    clientId: text("clientId").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    id: text("id").primaryKey().notNull(),
    referenceId: text("referenceId"),
    refreshId: text("refreshId"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    sessionId: text("sessionId"),
    token: text("token"),
    userId: text("userId"),
  },
  (table) => ({
    oauthAccessTokenClientIdIndex: index("oauthAccessToken_clientId_idx").on(
      table.clientId
    ),
    oauthAccessTokenRefreshIdIndex: index("oauthAccessToken_refreshId_idx").on(
      table.refreshId
    ),
    oauthAccessTokenSessionIdIndex: index("oauthAccessToken_sessionId_idx").on(
      table.sessionId
    ),
    oauthAccessTokenTokenUnique: uniqueIndex(
      "oauthAccessToken_token_unique"
    ).on(table.token),
    oauthAccessTokenUserIdIndex: index("oauthAccessToken_userId_idx").on(
      table.userId
    ),
  })
);

export const oauthConsentTable = sqliteTable(
  "oauthConsent",
  {
    clientId: text("clientId").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }),
    id: text("id").primaryKey().notNull(),
    referenceId: text("referenceId"),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }),
    userId: text("userId"),
  },
  (table) => ({
    oauthConsentClientIdIndex: index("oauthConsent_clientId_idx").on(
      table.clientId
    ),
    oauthConsentUserIdIndex: index("oauthConsent_userId_idx").on(table.userId),
  })
);
