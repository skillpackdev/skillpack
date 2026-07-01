import {
  skillsTable,
  skillVersionLabelsTable,
  skillVersionResourcesTable,
  skillVersionsTable,
} from "@server/db/schema";
import type { SkillFileMetadata } from "@server/shared/skill-file";
import type { Database } from "@server/types";
import type { SkillOriginJson } from "@skillpack/contracts/skills/state";
import { and, desc, eq as sqlEq, sql } from "drizzle-orm";

import { skillErrors } from "./errors";
import { createSkillVersionId, createSkillVersionLabelId } from "./ids";
import type {
  SkillIdentityRow,
  SkillRow,
  SkillVersionLabelResult,
  SkillVersionRow,
  SkillWithCurrentState,
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
  skillPk: number;
}

const currentVersionSelector = "current";

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
  headVersionPk: version.pk,
  license: version.license,
  metadata: version.metadata,
  origin: version.origin,
  versionId: version.id,
});

export class SkillRepository {
  private readonly db: Database;

  private readonly ownerUserId: string;

  constructor(db: Database, ownerUserId: string) {
    this.db = db;
    this.ownerUserId = ownerUserId;
  }

  async listSkills(): Promise<SkillWithCurrentState[]> {
    const rows = await this.db
      .select({ skill: skillsTable, version: skillVersionsTable })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(sqlEq(skillsTable.ownerUserId, this.ownerUserId))
      .orderBy(desc(skillsTable.updatedAt));

    return rows.map(({ skill, version }) => ({
      skill: toSkillRow(skill, version),
    }));
  }

  async findSkillByPk(skillPk: number) {
    const [row] = await this.db
      .select({ skill: skillsTable, version: skillVersionsTable })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(
        and(
          sqlEq(skillsTable.pk, skillPk),
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
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
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

  async listResourcesBySkillPk(skillPk: number) {
    const skill = await this.findSkillByPk(skillPk);

    if (!skill) {
      return [];
    }

    return await this.listResourcesByVersionPk(skill.headVersionPk, skill.pk);
  }

  async listResourcesByVersionPk(versionPk: number, skillPk: number) {
    const resources = await this.db.query.skillVersionResourcesTable.findMany({
      where: (resource, { eq }) => eq(resource.versionPk, versionPk),
    });

    return resources.map((resource) => ({ ...resource, skillPk }));
  }

  async findResourceByPath(skillPk: number, path: string) {
    const skill = await this.findSkillByPk(skillPk);

    if (!skill) {
      return;
    }

    const resource = await this.findVersionResourceByPath(
      skill.headVersionPk,
      path
    );

    return resource ? { ...resource, skillPk } : undefined;
  }

  private async findVersionResourceByPath(versionPk: number, path: string) {
    return await this.db.query.skillVersionResourcesTable.findFirst({
      where: (resources, operators) =>
        operators.and(
          operators.eq(resources.versionPk, versionPk),
          operators.eq(resources.path, path)
        ),
    });
  }

  async createSkill(input: CreateSkillInput, now: Date) {
    const versionId = createSkillVersionId();
    const skillInsert = this.db
      .insert(skillsTable)
      .values({
        createdAt: now,
        headVersionPk: 0,
        name: input.name,
        ownerUserId: this.ownerUserId,
        updatedAt: now,
      })
      .returning();
    const createdSkillPk = sql<number>`(
      select ${skillsTable.pk}
      from ${skillsTable}
      where ${skillsTable.ownerUserId} = ${this.ownerUserId}
        and ${skillsTable.name} = ${input.name}
      limit 1
    )`;
    const versionInsert = this.db
      .insert(skillVersionsTable)
      .values({
        allowedTools: input.skillFileMetadata.allowedTools ?? null,
        compatibility: input.skillFileMetadata.compatibility ?? null,
        createdAt: now,
        description: input.skillFileMetadata.description,
        id: versionId,
        license: input.skillFileMetadata.license ?? null,
        metadata: input.skillFileMetadata.metadata ?? null,
        origin: toOriginJson(input.origin),
        parentPk: null,
        skillPk: createdSkillPk,
      })
      .returning();
    const createdVersionPk = sql<number>`(
      select ${skillVersionsTable.pk}
      from ${skillVersionsTable}
      where ${skillVersionsTable.id} = ${versionId}
      limit 1
    )`;
    const headUpdate = this.db
      .update(skillsTable)
      .set({ headVersionPk: createdVersionPk })
      .where(sqlEq(skillsTable.pk, createdSkillPk));
    const resourceInsert = this.getResourceInsert(
      input.resources,
      createdVersionPk,
      now
    );

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
          { ...skillIdentity, headVersionPk: version.pk },
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
    const currentSkill = await this.findSkillByPk(input.skillPk);

    if (!currentSkill) {
      throw skillErrors.skillNotFound();
    }

    return await this.appendSkillVersion(
      currentSkill,
      {
        allowedTools: input.skillFileMetadata.allowedTools ?? null,
        compatibility: input.skillFileMetadata.compatibility ?? null,
        description: input.skillFileMetadata.description,
        license: input.skillFileMetadata.license ?? null,
        metadata: input.skillFileMetadata.metadata ?? null,
        origin: toOriginJson(input.origin),
        resources: input.resources,
        skillName: input.name,
      },
      now
    );
  }

  async listVersions(skillName: string) {
    const skill = await this.findSkillByName(skillName);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    const rows = await this.db
      .select({ label: skillVersionLabelsTable, version: skillVersionsTable })
      .from(skillVersionsTable)
      .leftJoin(
        skillVersionLabelsTable,
        sqlEq(skillVersionsTable.pk, skillVersionLabelsTable.versionPk)
      )
      .where(sqlEq(skillVersionsTable.skillPk, skill.pk))
      .orderBy(desc(skillVersionsTable.createdAt), desc(skillVersionsTable.pk));

    return rows.map(({ label, version }) => ({
      createdAt: version.createdAt,
      id: version.id,
      label: label?.label ?? null,
    }));
  }

  async resolveVersion(skillName: string, versionId: string) {
    const skill = await this.findSkillByName(skillName);

    if (!skill) {
      throw skillErrors.skillNotFound();
    }

    const version =
      versionId === currentVersionSelector
        ? await this.findVersionByPk(skill.headVersionPk)
        : await this.findVersionByPublicId(skill.pk, versionId);

    if (!version) {
      throw skillErrors.skillNotFound();
    }

    return { skill: toSkillRow(skill, version), version };
  }

  async resolveVersionResources(skillName: string, versionId: string) {
    const { skill, version } = await this.resolveVersion(skillName, versionId);
    const resources = await this.listResourcesByVersionPk(version.pk, skill.pk);

    return { resources, skill, version };
  }

  async findVersionResourceBySelector(
    skillName: string,
    versionId: string,
    path: string
  ) {
    const { skill, version } = await this.resolveVersion(skillName, versionId);
    const resource = await this.findVersionResourceByPath(version.pk, path);

    return resource ? { ...resource, skillPk: skill.pk } : undefined;
  }

  async upsertVersionLabel(
    skillName: string,
    versionId: string,
    label: string,
    now: Date
  ): Promise<SkillVersionLabelResult> {
    const { skill, version } = await this.resolveVersion(skillName, versionId);
    const existingLabel = await this.findLabelByVersionPk(version.pk);

    if (existingLabel) {
      const [updatedLabel] = await this.db
        .update(skillVersionLabelsTable)
        .set({ label, updatedAt: now })
        .where(sqlEq(skillVersionLabelsTable.pk, existingLabel.pk))
        .returning();

      if (!updatedLabel) {
        throw new Error("Version label was not updated");
      }

      return {
        id: updatedLabel.id,
        label: updatedLabel.label,
        versionId: version.id,
      };
    }

    const [createdLabel] = await this.db
      .insert(skillVersionLabelsTable)
      .values({
        createdAt: now,
        id: createSkillVersionLabelId(),
        label,
        skillPk: skill.pk,
        updatedAt: now,
        versionPk: version.pk,
      })
      .returning();

    if (!createdLabel) {
      throw new Error("Version label was not created");
    }

    return {
      id: createdLabel.id,
      label: createdLabel.label,
      versionId: version.id,
    };
  }

  async deleteVersionLabel(skillName: string, versionId: string) {
    const { version } = await this.resolveVersion(skillName, versionId);

    await this.db
      .delete(skillVersionLabelsTable)
      .where(sqlEq(skillVersionLabelsTable.versionPk, version.pk));
  }

  async restoreVersion(skillName: string, versionId: string, now: Date) {
    const currentSkill = await this.findSkillByName(skillName);

    if (!currentSkill) {
      throw skillErrors.skillNotFound();
    }

    if (versionId === currentVersionSelector) {
      throw skillErrors.invalidVersionSelector();
    }

    const version = await this.findVersionByPublicId(
      currentSkill.pk,
      versionId
    );

    if (!version) {
      throw skillErrors.skillNotFound();
    }

    if (version.pk === currentSkill.headVersionPk) {
      throw skillErrors.invalidVersionSelector();
    }

    const resources = await this.listResourcesByVersionPk(
      version.pk,
      currentSkill.pk
    );

    return await this.appendSkillVersion(
      currentSkill,
      {
        allowedTools: version.allowedTools,
        compatibility: version.compatibility,
        description: version.description,
        license: version.license,
        metadata: version.metadata,
        origin: version.origin,
        resources,
        skillName: currentSkill.name,
      },
      now
    );
  }

  async listVersionResources(skillPk: number) {
    const rows = await this.db
      .select({
        resource: skillVersionResourcesTable,
        version: skillVersionsTable,
      })
      .from(skillVersionsTable)
      .innerJoin(
        skillVersionResourcesTable,
        sqlEq(skillVersionsTable.pk, skillVersionResourcesTable.versionPk)
      )
      .where(sqlEq(skillVersionsTable.skillPk, skillPk));

    return rows.map(({ resource, version }) => ({
      ...resource,
      skillPk: version.skillPk,
    }));
  }

  async deleteSkillByPk(skillPk: number) {
    const skill = await this.findSkillByPk(skillPk);

    if (!skill) {
      return;
    }

    const versions = await this.db.query.skillVersionsTable.findMany({
      where: (version, { eq }) => eq(version.skillPk, skillPk),
    });

    for (const version of versions) {
      await this.db
        .delete(skillVersionResourcesTable)
        .where(sqlEq(skillVersionResourcesTable.versionPk, version.pk));
    }

    await this.db
      .delete(skillVersionLabelsTable)
      .where(sqlEq(skillVersionLabelsTable.skillPk, skillPk));
    await this.db
      .delete(skillVersionsTable)
      .where(sqlEq(skillVersionsTable.skillPk, skillPk));
    await this.db.delete(skillsTable).where(sqlEq(skillsTable.pk, skillPk));
  }

  private async findVersionByPk(versionPk: number) {
    return await this.db.query.skillVersionsTable.findFirst({
      where: (version, { eq }) => eq(version.pk, versionPk),
    });
  }

  private async findVersionByPublicId(skillPk: number, versionId: string) {
    return await this.db.query.skillVersionsTable.findFirst({
      where: (version, operators) =>
        operators.and(
          operators.eq(version.skillPk, skillPk),
          operators.eq(version.id, versionId)
        ),
    });
  }

  private async findLabelByVersionPk(versionPk: number) {
    return await this.db.query.skillVersionLabelsTable.findFirst({
      where: (label, { eq }) => eq(label.versionPk, versionPk),
    });
  }

  private getResourceInsert(
    resources: StoredResourceObject[],
    versionPk: number | ReturnType<typeof sql<number>>,
    now: Date
  ) {
    return resources.length > 0
      ? this.db.insert(skillVersionResourcesTable).values(
          resources.map((resource) => ({
            createdAt: now,
            mediaType: resource.mediaType,
            path: resource.path,
            sha256: resource.sha256,
            size: resource.size,
            versionPk,
          }))
        )
      : undefined;
  }

  private async appendSkillVersion(
    currentSkill: SkillRow,
    input: {
      allowedTools: string | null;
      compatibility: string | null;
      description: string;
      license: string | null;
      metadata: Record<string, string> | null;
      origin: SkillOriginJson | null;
      resources: StoredResourceObject[];
      skillName: string;
    },
    now: Date
  ) {
    const versionId = createSkillVersionId();
    const versionInsert = this.db
      .insert(skillVersionsTable)
      .values({
        allowedTools: input.allowedTools,
        compatibility: input.compatibility,
        createdAt: now,
        description: input.description,
        id: versionId,
        license: input.license,
        metadata: input.metadata,
        origin: input.origin,
        parentPk: currentSkill.headVersionPk,
        skillPk: currentSkill.pk,
      })
      .returning();
    const createdVersionPk = sql<number>`(
      select ${skillVersionsTable.pk}
      from ${skillVersionsTable}
      where ${skillVersionsTable.id} = ${versionId}
      limit 1
    )`;
    const skillUpdate = this.db
      .update(skillsTable)
      .set({
        name: input.skillName,
        updatedAt: now,
      })
      .where(sqlEq(skillsTable.pk, currentSkill.pk))
      .returning();
    const headUpdate = this.db
      .update(skillsTable)
      .set({ headVersionPk: createdVersionPk })
      .where(sqlEq(skillsTable.pk, currentSkill.pk));
    const resourceInsert = this.getResourceInsert(
      input.resources,
      createdVersionPk,
      now
    );

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
        { ...skillIdentity, headVersionPk: version.pk },
        version
      );
    } catch (error) {
      if (isUniqueSkillNameError(error)) {
        throw skillErrors.duplicateSkillName();
      }

      throw error;
    }
  }
}
