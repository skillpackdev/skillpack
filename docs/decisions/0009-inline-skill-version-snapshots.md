---
status: accepted
date: 2026-07-02
decision-makers: Sean
consulted: Current Skillpack codebase, ADR-0001, ADR-0002, ADR-0007, ADR-0008, CONTEXT.md, docs/backend-architecture.md
informed: Future Skillpack maintainers and coding agents
supersedes: ADR-0008 storage schema details for SKILL.md, frontmatter, origin, and resource manifests
---

# ADR-0009: Inline Skill Version Snapshots with First-Class SKILL.md Pointers

Skillpack keeps the append-only Skill Version DAG from ADR-0008, but refines the storage schema so each `skill_versions` row is a complete snapshot pointer: canonical `SKILL.md` is a first-class object reference, attached resources are stored as an inline manifest JSON, optional frontmatter is stored as JSON, and Skill Origin moves to the `skills` identity row.

## Context

ADR-0008 introduced append-only Skill Versions, a mutable `skills.head_version_pk` pointer, and Version Labels. That direction remains correct for safe agent authoring and recovery.

The first implementation copied every resource pointer into `skill_version_resources`, including `SKILL.md`. That made `SKILL.md` look like a normal attached resource even though it has stronger semantics:

- every Skill Version must have exactly one canonical `SKILL.md`;
- `SKILL.md` has a fixed media type of `text/markdown; charset=utf-8`;
- SEP-2640 index digests are based on the canonical `SKILL.md` object;
- `SKILL.md` frontmatter is an agent compatibility surface, while D1 stores the canonical structured projection;
- attached resources may be empty, added, replaced, or deleted independently.

The row-per-resource model also made hot reads more complex. `skill://index.json` needed a join to find the `SKILL.md` row. `resources/list` needed to avoid N+1 service resolution. `read_skill` needed care to avoid reading `SKILL.md` from R2 twice.

A content-addressed manifest table was considered. It would avoid copying the attached resource manifest JSON across skill-only updates, but it adds a new table, canonical JSON hashing, upsert/dedupe logic, and another lookup. Current Skillpack skills are small instruction packages, so the added complexity is premature.

## Decision

### 1. Keep Skill Versions as append-only snapshot nodes

`skills.head_version_pk` remains the current pointer. Every durable create, patch, restore, or fork update appends a new `skill_versions` row and moves `skills.head_version_pk`.

### 2. Move Skill Origin to `skills`

Origin describes where the Managed Skill entered Skillpack, not the bytes of a particular version. Store it on `skills.origin`.

Restore keeps the current Skill Origin. Forking/importing into an existing Skill updates `skills.origin` and appends a new version.

If Skillpack later needs per-import provenance, add a separate event/source table such as `skill_import_events` or `skill_versions.source`, rather than overloading Skill Origin.

### 3. Model canonical `SKILL.md` as first-class version fields

Add these columns to `skill_versions`:

```text
skill_file_sha256 text not null
skill_file_size integer not null
```

Do not add a `skill_file_media_type` column. The media type is always the shared `markdownMediaType` constant.

### 4. Store optional frontmatter as JSON

Replace low-value optional columns with a single `frontmatter` JSON field on `skill_versions`.

```ts
type SkillVersionFrontmatter = {
  "allowed-tools"?: string;
  compatibility?: string;
  license?: string;
  metadata?: Record<string, string>;
} & Record<string, unknown>;
```

`name` and `description` stay out of `frontmatter`:

- `skills.name` is the user-scoped Skill identity and public operation name.
- `skill_versions.description` is the catalog/list/search projection.

When rendering a full `SKILL.md`, compose:

```ts
{
  ...version.frontmatter,
  description: version.description,
  name: skill.name,
}
```

Known frontmatter keys continue to project to API response fields for compatibility.

### 5. Store attached resources as inline manifest JSON

Replace `skill_version_resources` with `skill_versions.resource_manifest` JSON.

```ts
type SkillResourceManifestItem = {
  mediaType: string;
  path: string;
  sha256: string;
  size: number;
};
```

The manifest contains attached resources only. It never contains `SKILL.md` or descendant `SKILL.md` paths.

`SKILL.md` remains exposed as a resource through API/MCP/Pi delivery surfaces by synthesizing a resource item from `skill_versions.skill_file_sha256` and `skill_versions.skill_file_size`.

### 6. Defer manifest CAS

Do not introduce a `skill_resource_manifests` CAS table now. Inline manifest JSON is simpler, has fewer queries, and fits the expected skill package size.

Revisit manifest CAS only when one of these signals appears:

- skills regularly have hundreds of attached resources;
- D1 storage or row size becomes a measured bottleneck;
- skill-only update frequency makes manifest JSON copying materially expensive;
- R2 garbage collection or cross-version resource reachability requires SQL-level indexing.

## Target Schema

```text
skills(
  pk,
  owner_user_id,
  name,
  origin,
  head_version_pk,
  created_at,
  updated_at,
  UNIQUE(owner_user_id, name)
)

skill_versions(
  pk,
  id,
  skill_pk,
  parent_pk,
  description,
  frontmatter,
  skill_file_sha256,
  skill_file_size,
  resource_manifest,
  created_at,
  UNIQUE(id)
)

skill_version_labels(
  pk,
  id,
  skill_pk,
  version_pk,
  label,
  created_at,
  updated_at,
  UNIQUE(skill_pk, version_pk)
)
```

R2 keeps content-addressed objects under `objects/sha256/{sha256}`.

## Use Case Walkthrough

### List Skills

Read `skills` joined to the head `skill_versions` row. No manifest load from another table and no R2 read.

Returned API fields are projected from:

- `skills.name`
- `skills.origin`
- `skill_versions.description`
- `skill_versions.frontmatter`
- `skills.created_at`
- `skills.updated_at`

### Read Current Skill

Read `skills` joined to head `skill_versions`. Read canonical `SKILL.md` once from R2 by `skill_file_sha256`. Return the attached resources from `resource_manifest`.

### Read `SKILL.md` as a Resource

Path `SKILL.md` is handled as a special resource lookup backed by the head version's `skill_file_sha256` and `skill_file_size`.

### Read an Attached Resource

Read the current version, find the requested path in `resource_manifest`, then read the referenced R2 object by sha256.

### List MCP Resources

Read current versions and inline manifests in one query. For each skill, synthesize the `SKILL.md` resource and append attached resource manifest entries.

### Read `skill://index.json`

Read current versions in one query. Digest is `sha256:${skill_file_sha256}`. Frontmatter is built from `skills.name`, `skill_versions.description`, and `skill_versions.frontmatter`. R2 reads: zero.

### Create Skill

Serialize `SKILL.md`, store it in R2, store attached resources in R2, insert `skills`, insert the first `skill_versions` row with the skill file pointer and inline resource manifest, then move `skills.head_version_pk`.

### Patch Skill Content or Metadata

Append a new version. Store a new `SKILL.md` object only when the rendered skill file changes. Reuse the previous `resource_manifest` unless attached resources changed.

### Patch Attached Resources

Apply delete/upsert operations to the current inline manifest, store changed resource objects in R2, append a new version with the previous skill file pointer and the new manifest.

### Restore Version

Append a new head version that copies the selected version's `description`, `frontmatter`, `skill_file_sha256`, `skill_file_size`, and `resource_manifest`. Do not read or rewrite R2 objects.

### Fork New or Existing Skill

For a new Skill, insert `skills.origin` and the initial version. For an existing Skill, update `skills.origin` and append a new version.

### Delete Skill

Delete `skills`, its versions, and labels. R2 CAS objects remain retained, consistent with ADR-0008's deferred GC.

## Implementation Plan

### Milestone 1: Plan and decision record

- Add this ADR.
- Mark the ADR index with ADR-0009.
- Add a short note to ADR-0008 that ADR-0009 refines its storage schema details.
- Update `CONTEXT.md` terms for Skill Origin, Skill Version, Resource Manifest, and Skill File after implementation.

### Milestone 2: Schema and repository model

Affected files:

- `apps/skillpack/server/db/schema.ts`
- `apps/skillpack/migrations/*`
- `apps/skillpack/server/modules/skills/types.ts`
- `apps/skillpack/server/modules/skills/repository.ts`
- `apps/skillpack/server/modules/skills/resource-manifest.ts`

TDD tracer:

- Add/update repository-facing behavior through service integration tests showing a current Skill can be created and read while attached resource count excludes `SKILL.md`.
- Add migration/e2e coverage that old rows are converted into `skill_file_sha256`, `skill_file_size`, and inline `resource_manifest`.

Implementation:

- Add `skills.origin`.
- Add `skill_versions.frontmatter`, `skill_file_sha256`, `skill_file_size`, `resource_manifest`.
- Remove code paths that write `SKILL.md` into attached resource rows/manifests.
- Convert repository DTOs so `SkillRow` projects known frontmatter keys for existing contracts.

### Milestone 3: Service, API, MCP, and Pi behavior

Affected files:

- `apps/skillpack/server/modules/skills/service.ts`
- `apps/skillpack/server/modules/skills/presenter.ts`
- `apps/skillpack/server/modules/skills/route.ts`
- `apps/skillpack/server/modules/mcp/resources/*.ts`
- `apps/skillpack/server/modules/mcp/tools/*.ts`
- `packages/pi-extension/src/*` if response shapes require updates
- server and extension tests

TDD tracer:

- `read_skill` reads canonical `SKILL.md` once and returns attached resources without `SKILL.md` in the manifest.
- `resources/list` synthesizes `skill://{name}/SKILL.md` from version fields and reads no R2 objects.
- `skill://index.json` uses D1 version fields and reads no R2 objects.

Implementation:

- Treat `SKILL.md` as a special resource path in read APIs.
- Keep external API/MCP behavior stable.
- Keep MCP `update_skill` support for `upsertResources` with path `SKILL.md` by translating it into a skill-file patch before service writes.

### Milestone 4: Simplify, review, and performance audit

- Run `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm test`.
- Review hot paths for query counts and R2 reads.
- Remove compatibility helpers that only existed for `skill_version_resources`.
- Confirm no N+1 queries in:
  - `listSkills`
  - MCP `resources/list`
  - `skill://index.json`
  - `read_skill`
  - REST current and historical resource reads

## Migration Plan

Use a table rebuild migration for D1/SQLite compatibility.

1. Create new tables with target columns.
2. Copy `skills`, moving current-head `skill_versions.origin` into `skills.origin`.
3. Copy `skill_versions`, deriving:
   - `skill_file_sha256` from `skill_version_resources.path = 'SKILL.md'`;
   - `skill_file_size` from the same row;
   - `frontmatter` from old optional columns;
   - `resource_manifest` from all non-`SKILL.md` resource rows.
4. Copy `skill_version_labels` unchanged.
5. Drop old `skill_versions` and `skill_version_resources`.
6. Rename new tables and recreate indexes.

## Verification

- [ ] Existing create/read/update/delete REST behavior remains covered.
- [ ] Existing MCP create/update/read/resource behavior remains covered.
- [ ] Version history, restore, labels, and historical resource reads remain covered.
- [ ] `SKILL.md` is not stored in attached resource manifests.
- [ ] `skill://index.json` performs no R2 reads.
- [ ] MCP `resources/list` performs no R2 reads and no per-skill service resolution.
- [ ] `read_skill` reads `SKILL.md` from R2 once.
- [ ] `pnpm check` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
