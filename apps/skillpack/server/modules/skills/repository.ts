import {
  skillRefsTable,
  skillsTable,
  skillVersionResourcesTable,
  skillVersionsTable,
} from "@server/db/schema";
import type { SkillFileMetadata } from "@server/shared/skill-file";
import type { Database } from "@server/types";
import type { SkillOriginJson } from "@skillpack/contracts/skills/state";
import { and, desc, eq as sqlEq, sql } from "drizzle-orm";

import { skillErrors } from "./errors";
import type {
  SkillIdentityRow,
  SkillRow,
  SkillVersionRow,
  StoredResourceObject,
} from "./types";

interface SkillOriginInput {
  kind: "github";
  metadata: Record<string, unknown> | null;
  url: string;
}

interface CreateSkillInput {
  name: string;
  origin?: SkillOriginInput;
  resources: StoredResourceObject[];
  skillFileMetadata: Omit<SkillFileMetadata, "name">;
}

interface UpdateSkillStateInput {
  name: string;
  origin?: SkillOriginInput | null;
  resources: StoredResourceObject[];
  skillFileMetadata: Omit<SkillFileMetadata, "name">;
  skillId: number;
}

const isUniqueConstraintError = (error: unknown): error is Error =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed");

const isUniqueSkillNameError = (error: unknown) =>
  isUniqueConstraintError(error) && error.message.includes("skills");

const toOriginJson = (
  origin?: SkillOriginInput | null
): SkillOriginJson | null =>
  origin
    ? {
        kind: origin.kind,
        metadata: origin.metadata,
        url: origin.url,
      }
    : null;

const toSkillRow = (
  skill: SkillIdentityRow,
  version: SkillVersionRow
): SkillRow => ({
  ...skill,
  allowedTools: version.allowedTools,
  compatibility: version.compatibility,
  description: version.description,
  headVersionId: version.id,
  license: version.license,
  metadata: version.metadata,
  origin: version.origin,
});

export class SkillRepository {
  private readonly db: Database;

  private readonly ownerUserId: string;

  constructor(db: Database, ownerUserId: string) {
    this.db = db;
    this.ownerUserId = ownerUserId;
  }

  async listSkills() {
    const rows = await this.db
      .select({ skill: skillsTable, version: skillVersionsTable })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionId, skillVersionsTable.id)
      )
      .where(sqlEq(skillsTable.ownerUserId, this.ownerUserId))
      .orderBy(desc(skillsTable.updatedAt));

    return rows.map(({ skill, version }) => ({
      skill: toSkillRow(skill, version),
    }));
  }

  async findSkillById(skillId: number) {
    const [row] = await this.db
      .select({ skill: skillsTable, version: skillVersionsTable })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionId, skillVersionsTable.id)
      )
      .where(
        and(
          sqlEq(skillsTable.id, skillId),
          sqlEq(skillsTable.ownerUserId, this.ownerUserId)
        )
      )
      .limit(1);

    return row ? toSkillRow(row.skill, row.version) : undefined;
  }

  async findSkillByName(name: string) {
    const [row] = await this.db
      .select({ skill: skillsTable, version: skillVersionsTable })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionId, skillVersionsTable.id)
      )
      .where(
        and(
          sqlEq(skillsTable.ownerUserId, this.ownerUserId),
          sqlEq(skillsTable.name, name)
        )
      )
      .limit(1);

    return row ? toSkillRow(row.skill, row.version) : undefined;
  }

  async listResourcesBySkillId(skillId: number) {
    const skill = await this.findSkillById(skillId);

    if (!skill) {
      return [];
    }

    const { headVersionId } = skill;

    const resources = await this.db.query.skillVersionResourcesTable.findMany({
      where: (resource, { eq }) => eq(resource.versionId, headVersionId),
    });

    return resources.map((resource) => ({ ...resource, skillId }));
  }

  async findResourceByPath(skillId: number, path: string) {
    const skill = await this.findSkillById(skillId);

    if (!skill) {
      return;
    }

    const { headVersionId } = skill;

    const resource = await this.db.query.skillVersionResourcesTable.findFirst({
      where: (resources, operators) =>
        operators.and(
          operators.eq(resources.versionId, headVersionId),
          operators.eq(resources.path, path)
        ),
    });

    return resource ? { ...resource, skillId } : undefined;
  }

  async createSkill(input: CreateSkillInput, now: Date) {
    const skillInsert = this.db
      .insert(skillsTable)
      .values({
        createdAt: now,
        headVersionId: 0,
        name: input.name,
        ownerUserId: this.ownerUserId,
        updatedAt: now,
      })
      .returning();
    const createdSkillId = sql<number>`(
      select ${skillsTable.id}
      from ${skillsTable}
      where ${skillsTable.ownerUserId} = ${this.ownerUserId}
        and ${skillsTable.name} = ${input.name}
      limit 1
    )`;
    const versionInsert = this.db
      .insert(skillVersionsTable)
      .values({
        allowedTools: input.skillFileMetadata.allowedTools ?? null,
        authorKind: "user",
        compatibility: input.skillFileMetadata.compatibility ?? null,
        createdAt: now,
        description: input.skillFileMetadata.description,
        license: input.skillFileMetadata.license ?? null,
        metadata: input.skillFileMetadata.metadata ?? null,
        origin: toOriginJson(input.origin),
        parentId: null,
        skillId: createdSkillId,
        tokenId: null,
      })
      .returning();
    const createdVersionId = sql<number>`(
      select ${skillVersionsTable.id}
      from ${skillVersionsTable}
      where ${skillVersionsTable.skillId} = ${createdSkillId}
      order by ${skillVersionsTable.id} desc
      limit 1
    )`;
    const headUpdate = this.db
      .update(skillsTable)
      .set({ headVersionId: createdVersionId })
      .where(sqlEq(skillsTable.id, createdSkillId));
    const resourceInsert =
      input.resources.length > 0
        ? this.db.insert(skillVersionResourcesTable).values(
            input.resources.map((resource) => ({
              createdAt: now,
              mediaType: resource.mediaType,
              path: resource.path,
              sha256: resource.sha256,
              size: resource.size,
              versionId: createdVersionId,
            }))
          )
        : undefined;

    try {
      const [skillRows, versionRows] = await this.db.batch(
        resourceInsert
          ? [skillInsert, versionInsert, resourceInsert, headUpdate]
          : [skillInsert, versionInsert, headUpdate]
      );
      const [skillIdentity] = skillRows;
      const [version] = versionRows;

      if (!(skillIdentity && version)) {
        throw new Error("Skill was not created");
      }

      return {
        skill: toSkillRow(
          { ...skillIdentity, headVersionId: version.id },
          version
        ),
      };
    } catch (error) {
      if (isUniqueSkillNameError(error)) {
        throw skillErrors.duplicateSkillName();
      }

      throw error;
    }
  }

  async updateSkillState(input: UpdateSkillStateInput, now: Date) {
    const currentSkill = await this.findSkillById(input.skillId);

    if (!currentSkill) {
      throw skillErrors.skillNotFound();
    }

    const versionInsert = this.db
      .insert(skillVersionsTable)
      .values({
        allowedTools: input.skillFileMetadata.allowedTools ?? null,
        authorKind: "user",
        compatibility: input.skillFileMetadata.compatibility ?? null,
        createdAt: now,
        description: input.skillFileMetadata.description,
        license: input.skillFileMetadata.license ?? null,
        metadata: input.skillFileMetadata.metadata ?? null,
        origin: toOriginJson(input.origin),
        parentId: currentSkill.headVersionId,
        skillId: input.skillId,
        tokenId: null,
      })
      .returning();
    const createdVersionId = sql<number>`(
      select ${skillVersionsTable.id}
      from ${skillVersionsTable}
      where ${skillVersionsTable.skillId} = ${input.skillId}
      order by ${skillVersionsTable.id} desc
      limit 1
    )`;
    const skillUpdate = this.db
      .update(skillsTable)
      .set({
        name: input.name,
        updatedAt: now,
      })
      .where(sqlEq(skillsTable.id, input.skillId))
      .returning();
    const headUpdate = this.db
      .update(skillsTable)
      .set({ headVersionId: createdVersionId })
      .where(sqlEq(skillsTable.id, input.skillId));
    const resourceInsert =
      input.resources.length > 0
        ? this.db.insert(skillVersionResourcesTable).values(
            input.resources.map((resource) => ({
              createdAt: now,
              mediaType: resource.mediaType,
              path: resource.path,
              sha256: resource.sha256,
              size: resource.size,
              versionId: createdVersionId,
            }))
          )
        : undefined;

    try {
      const [versionRows, skillRows] = await this.db.batch(
        resourceInsert
          ? [versionInsert, skillUpdate, resourceInsert, headUpdate]
          : [versionInsert, skillUpdate, headUpdate]
      );
      const [version] = versionRows;
      const [skillIdentity] = skillRows;

      if (!(skillIdentity && version)) {
        throw skillErrors.skillNotFound();
      }

      return toSkillRow(
        { ...skillIdentity, headVersionId: version.id },
        version
      );
    } catch (error) {
      if (isUniqueSkillNameError(error)) {
        throw skillErrors.duplicateSkillName();
      }

      throw error;
    }
  }

  async listVersionResources(skillId: number) {
    const rows = await this.db
      .select({
        resource: skillVersionResourcesTable,
        version: skillVersionsTable,
      })
      .from(skillVersionsTable)
      .innerJoin(
        skillVersionResourcesTable,
        sqlEq(skillVersionsTable.id, skillVersionResourcesTable.versionId)
      )
      .where(sqlEq(skillVersionsTable.skillId, skillId));

    return rows.map(({ resource, version }) => ({
      ...resource,
      skillId: version.skillId,
    }));
  }

  async createSkillRef(skillId: number, name: string, now: Date) {
    const skill = await this.findSkillById(skillId);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    const [ref] = await this.db
      .insert(skillRefsTable)
      .values({
        createdAt: now,
        name,
        skillId,
        versionId: skill.headVersionId,
      })
      .returning();

    if (!ref) {
      throw new Error("Skill ref was not created");
    }

    return ref;
  }

  async deleteSkillById(skillId: number) {
    const skill = await this.findSkillById(skillId);

    if (!skill) {
      return;
    }

    const versions = await this.db.query.skillVersionsTable.findMany({
      where: (version, { eq }) => eq(version.skillId, skillId),
    });

    for (const version of versions) {
      await this.db
        .delete(skillVersionResourcesTable)
        .where(sqlEq(skillVersionResourcesTable.versionId, version.id));
    }

    await this.db
      .delete(skillRefsTable)
      .where(sqlEq(skillRefsTable.skillId, skillId));
    await this.db
      .delete(skillVersionsTable)
      .where(sqlEq(skillVersionsTable.skillId, skillId));
    await this.db.delete(skillsTable).where(sqlEq(skillsTable.id, skillId));
  }
}
