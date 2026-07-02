import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const migrationsThroughVersionHistory = [
  "0000_initial.sql",
  "0001_better_auth_oauth_provider.sql",
  "0002_api_keys.sql",
  "0003_skill_version_history.sql",
];

export const currentMigrations = [
  ...migrationsThroughVersionHistory,
  "0004_inline_skill_version_snapshots.sql",
];

const splitSqlStatements = (sql: string) =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

export const applyMigrationFile = async (db: D1Database, path: string) => {
  const sql = await readFile(path, "utf-8");

  for (const statement of splitSqlStatements(sql)) {
    await db.prepare(statement).run();
  }
};

export const applyMigration = async (db: D1Database, migration: string) => {
  await applyMigrationFile(db, join(process.cwd(), "migrations", migration));
};

export const applyMigrations = async (
  db: D1Database,
  migrations: string[] = currentMigrations
) => {
  for (const migration of migrations) {
    await applyMigration(db, migration);
  }
};

export const applyFreshSchema = async (db: D1Database) => {
  await applyMigrations(db, currentMigrations);
};
