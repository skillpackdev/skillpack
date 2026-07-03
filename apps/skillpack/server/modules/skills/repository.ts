import { skillContentPath } from "@server/constants";
import {
  skillsTable,
  skillVersionLabelsTable,
  skillVersionsTable,
} from "@server/db/schema";
import { markdownMediaType } from "@server/shared/text-resource";
import type { Database } from "@server/types";
import { and, desc, eq as sqlEq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { skillErrors } from "./errors";
import { createSkillVersionId, createSkillVersionLabelId } from "./ids";
import type {
  SkillRow,
  SkillVersionFrontmatter,
  SkillVersionLabelResult,
  SkillWithCurrentResource,
  SkillWithCurrentResources,
  SkillWithCurrentState,
  StoredResourceObject,
} from "./types";
import type { SkillFileStateInput, SkillOriginInput } from "./version-state";
import {
  findManifestResource,
  findResourceInCurrentVersion,
  toOriginJson,
  toResourceRows,
  toSkillFileResource,
  toSkillRow,
  toSkillWithCurrentResources,
  toStoredResource,
  toVersionFrontmatter,
  versionStateSelection,
  versionWithManifestSelection,
} from "./version-state";

interface CreateSkillInput {
  name: string;
  origin?: SkillOriginInput;
  resources: StoredResourceObject[];
  skillFile: StoredResourceObject;
  skillFileMetadata: SkillFileStateInput;
}

interface UpdateSkillStateInput {
  name: string;
  origin?: SkillOriginInput | null;
  resources: StoredResourceObject[];
  skillFile: StoredResourceObject;
  skillFileMetadata: SkillFileStateInput;
  skillPk: number;
}

interface AppendSkillVersionInput {
  description: string;
  frontmatter: SkillVersionFrontmatter | null;
  origin?: SkillOriginInput | null;
  resources: StoredResourceObject[];
  skillFile: StoredResourceObject;
  skillName: string;
}

const currentVersionSelector = "current";
const isUniqueConstraintError = (error: unknown): error is Error =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed");

const isUniqueSkillNameError = (error: unknown) =>
  isUniqueConstraintError(error) && error.message.includes("skills");

export class SkillRepository {
  private readonly db: Database;

  private readonly ownerUserId: string;

  constructor(db: Database, ownerUserId: string) {
    this.db = db;
    this.ownerUserId = ownerUserId;
  }

  async listSkills(): Promise<SkillWithCurrentState[]> {
    const rows = await this.listCurrentVersionStates();

    return rows.map(({ skill, version }) => ({
      skill: toSkillRow(skill, version),
    }));
  }

  async listSkillsWithCurrentSkillFile(): Promise<SkillWithCurrentResource[]> {
    const rows = await this.listCurrentVersionStates();

    return rows.map(({ skill, version }) => ({
      resource: toSkillFileResource(skill, version),
      skill: toSkillRow(skill, version),
    }));
  }

  async listSkillsWithCurrentResources(): Promise<SkillWithCurrentResources[]> {
    const rows = await this.db
      .select({ skill: skillsTable, version: versionWithManifestSelection })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(sqlEq(skillsTable.ownerUserId, this.ownerUserId))
      .orderBy(desc(skillsTable.updatedAt));

    return rows.map(({ skill, version }) => ({
      resources: [
        toSkillFileResource(skill, version),
        ...toResourceRows(version.resourceManifest, skill.pk, version.pk),
      ],
      skill: toSkillRow(skill, version),
    }));
  }

  async findSkillByPk(skillPk: number) {
    const row = await this.findCurrentVersionState(
      sqlEq(skillsTable.pk, skillPk)
    );

    return row ? toSkillRow(row.skill, row.version) : undefined;
  }

  async findSkillByName(name: string) {
    const row = await this.findCurrentVersionState(
      sqlEq(skillsTable.name, name)
    );

    return row ? toSkillRow(row.skill, row.version) : undefined;
  }

  async findSkillWithCurrentResourcesByPk(skillPk: number) {
    const row = await this.findCurrentVersionWithManifest(
      sqlEq(skillsTable.pk, skillPk)
    );

    return row ? toSkillWithCurrentResources(row) : undefined;
  }

  async findSkillWithCurrentResourcesByName(name: string) {
    const row = await this.findCurrentVersionWithManifest(
      sqlEq(skillsTable.name, name)
    );

    return row ? toSkillWithCurrentResources(row) : undefined;
  }

  async listResourcesBySkillPk(skillPk: number) {
    const state = await this.findSkillWithCurrentResourcesByPk(skillPk);

    return state ? state.resources : [];
  }

  async findResourceByName(skillName: string, path: string) {
    const row = await this.findCurrentVersionWithManifest(
      sqlEq(skillsTable.name, skillName)
    );

    return row ? findResourceInCurrentVersion(row, path) : undefined;
  }

  async createSkill(input: CreateSkillInput, now: Date) {
    const versionId = createSkillVersionId();
    const skillInsert = this.db
      .insert(skillsTable)
      .values({
        createdAt: now,
        headVersionPk: 0,
        name: input.name,
        origin: toOriginJson(input.origin),
        ownerUserId: this.ownerUserId,
        updatedAt: now,
      })
      .returning();
    // D1 has no interactive transactions, so later batch statements cannot
    // reference pks returned by earlier ones. Instead, resolve pks inside the
    // atomic db.batch via subqueries on unique keys ((ownerUserId, name) for
    // skills, versionId for versions).
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
        createdAt: now,
        description: input.skillFileMetadata.description,
        frontmatter: toVersionFrontmatter(input.skillFileMetadata),
        id: versionId,
        parentPk: null,
        resourceManifest: input.resources.map(toStoredResource),
        skillFileSha256: input.skillFile.sha256,
        skillFileSize: input.skillFile.size,
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

    try {
      const [skillRows, versionRows] = await this.db.batch([
        skillInsert,
        versionInsert,
        headUpdate,
      ]);
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
        description: input.skillFileMetadata.description,
        frontmatter: toVersionFrontmatter(input.skillFileMetadata),
        origin: input.origin,
        resources: input.resources,
        skillFile: input.skillFile,
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
    const resources = toResourceRows(
      version.resourceManifest,
      skill.pk,
      version.pk
    );

    return { resources, skill, version };
  }

  async findVersionResourceBySelector(
    skillName: string,
    versionId: string,
    path: string
  ) {
    const { skill, version } = await this.resolveVersion(skillName, versionId);

    if (path === skillContentPath) {
      return toSkillFileResource(skill, version);
    }

    return findManifestResource(version, path, skill.pk);
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

    return await this.appendSkillVersion(
      currentSkill,
      {
        description: version.description,
        frontmatter: version.frontmatter,
        origin: currentSkill.origin,
        resources: version.resourceManifest,
        skillFile: {
          mediaType: markdownMediaType,
          path: skillContentPath,
          sha256: version.skillFileSha256,
          size: version.skillFileSize,
        },
        skillName: currentSkill.name,
      },
      now
    );
  }

  async deleteSkillByPk(skillPk: number) {
    const skill = await this.findSkillByPk(skillPk);

    if (!skill) {
      return;
    }

    await this.db.batch([
      this.db
        .delete(skillVersionLabelsTable)
        .where(sqlEq(skillVersionLabelsTable.skillPk, skillPk)),
      this.db
        .delete(skillVersionsTable)
        .where(sqlEq(skillVersionsTable.skillPk, skillPk)),
      this.db.delete(skillsTable).where(sqlEq(skillsTable.pk, skillPk)),
    ]);
  }

  private async listCurrentVersionStates() {
    return await this.db
      .select({ skill: skillsTable, version: versionStateSelection })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(sqlEq(skillsTable.ownerUserId, this.ownerUserId))
      .orderBy(desc(skillsTable.updatedAt));
  }

  private async findCurrentVersionState(skillFilter: SQL) {
    const [row] = await this.db
      .select({ skill: skillsTable, version: versionStateSelection })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(and(sqlEq(skillsTable.ownerUserId, this.ownerUserId), skillFilter))
      .limit(1);

    return row;
  }

  private async findCurrentVersionWithManifest(skillFilter: SQL) {
    const [row] = await this.db
      .select({ skill: skillsTable, version: versionWithManifestSelection })
      .from(skillsTable)
      .innerJoin(
        skillVersionsTable,
        sqlEq(skillsTable.headVersionPk, skillVersionsTable.pk)
      )
      .where(and(sqlEq(skillsTable.ownerUserId, this.ownerUserId), skillFilter))
      .limit(1);

    return row;
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

  private async appendSkillVersion(
    currentSkill: SkillRow,
    input: AppendSkillVersionInput,
    now: Date
  ) {
    const versionId = createSkillVersionId();
    const versionInsert = this.db
      .insert(skillVersionsTable)
      .values({
        createdAt: now,
        description: input.description,
        frontmatter: input.frontmatter,
        id: versionId,
        parentPk: currentSkill.headVersionPk,
        resourceManifest: input.resources.map(toStoredResource),
        skillFileSha256: input.skillFile.sha256,
        skillFileSize: input.skillFile.size,
        skillPk: currentSkill.pk,
      })
      .returning();
    // See createSkill: pk resolution via unique-key subquery keeps the batch
    // atomic on D1.
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
        origin: toOriginJson(input.origin),
        updatedAt: now,
      })
      .where(sqlEq(skillsTable.pk, currentSkill.pk))
      .returning();
    const headUpdate = this.db
      .update(skillsTable)
      .set({ headVersionPk: createdVersionPk })
      .where(sqlEq(skillsTable.pk, currentSkill.pk));

    try {
      const [versionRows, skillRows] = await this.db.batch([
        versionInsert,
        skillUpdate,
        headUpdate,
      ]);
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
