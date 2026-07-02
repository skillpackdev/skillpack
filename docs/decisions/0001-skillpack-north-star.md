---
status: superseded
date: 2026-05-25
updated: 2026-07-02
superseded-by: ADR-0008, ADR-0009, CONTEXT.md
decision-makers: Sean
consulted: Current Skillpack codebase, CONTEXT.md, backend architecture guidance, agent skills reference, Skill Delivery docs, MCP delivery ADR
informed: Future Skillpack maintainers and coding agents
---

# ADR-0001: Define Skillpack as a Skill-Centric Management Platform

> Superseded as an implementation guide. Use `CONTEXT.md` for current domain language, ADR-0008 for the append-only Skill Version DAG, and ADR-0009 for first-class `SKILL.md` pointers plus inline attached Resource Manifests. This ADR remains useful historical context for Skillpack's skill-centric product direction.

Skillpack is a Skills Management Platform for agents. It manages user-owned skills as platform-owned Skill objects, organizes them into user-curated skill collections, and delivers Skills to agent runtimes through Skillpack-mediated interfaces.

This ADR replaces the earlier version-first Managed Skill model with a Skill-centric model. Skill remains the primary product object. The current Skill state is the default managed and delivered state. Snapshots are historical checkpoints derived from a Skill.

## Context

The previous north star correctly moved Skillpack away from an aggregator/source-qualified model and toward user-owned Managed Skills. It also made Skill Name the user-facing operation identity and Skill ID the internal identity.

The previous model still treated every content change as a Managed Skill Version. That created unnecessary complexity for Skillpack's product goal:

- PATCH had to create a new version for every save.
- Rename semantics were unclear because Skill Name was treated as immutable and versions did not own names.
- Delivery APIs and locators had to carry optional version pins.
- Restore created yet another version rather than restoring the Skill's current state.
- Provenance required a separate version-level table.
- The database made `skills` an identity shell while `skill_versions` held the actual deliverable content state.

Skillpack's focus is skill delivery and management. It is a managed Skill Library for agent consumption, not a Git-like version-control system for skills.

## Decision

Skillpack's high-level system model is:

```text
Skill Origin -> Forked or Authored Managed Skill -> Skill Trust -> Skill Set -> Skill Delivery
```

The Managed Skill is the primary current-state object. A Skill Snapshot is an explicit checkpoint of that current state.

## Core Concepts

### Managed Skill

A Managed Skill is the primary product object. It is a user-owned, platform-stored Skill record in Skillpack's Library that users can understand and agents can consume.

Forked, user-authored, agent-created, and API-created skills all become Managed Skills once Skillpack stores and owns their lifecycle for one user.

A Managed Skill owns its current deliverable state:

- Skill Name
- description and other structured metadata
- nullable Skill Origin metadata
- canonical instruction content
- Resource Manifest, including `SKILL.md` and attached resources
- timestamps and trust/review metadata

### Skill ID

A Skill ID is the Skillpack-owned internal opaque storage identity for a Managed Skill.

Skill IDs are the stable identity that attach Snapshots and internal resources to a Managed Skill. Skill IDs may be pre-generated to support storage workflows and D1 batch writes, but they are not user-facing or agent-facing operation identifiers. Public APIs, user interfaces, and Skill Locations address Managed Skills by Skill Name within an authorized user context.

### Skill Name

A Skill Name is the lowercase-hyphen operation name for a Managed Skill inside one user's Skill Library.

Skill Names are unique within one user's Library. Users can rename a Managed Skill in place. Rename changes the user-facing API and delivery locator, while the stable internal Skill ID keeps Snapshots and internal associations attached to the same Managed Skill.

Old Skill Locations using the previous Skill Name do not remain valid in the core model. Alias or redirect behavior can be added later as an explicit compatibility feature.

### Skill Origin

A Skill Origin is nullable structured provenance metadata on the Managed Skill's current state, such as GitHub, npm, another registry, user authoring, agent creation, or API creation.

Origin never forms the skill's primary identity. Origin does not track whether the current content has diverged from the original source. It records where the Skill came from, not a sync relationship. Origin is captured inside Skill Snapshots as part of whole-state snapshotting.

For the current design horizon, a separate `skill_origins` table is unnecessary. Origin can be stored as structured JSON on the Skill state and inside Snapshot state JSON.

### Fork / Add to Library

Fork is the product workflow for bringing third-party content into Skillpack.

In user-facing UI, Fork is presented as Add to Library. If the selected source Skill Name is unused in the user's Library, Add to Library creates a Managed Skill. If that Skill Name is already used, Add to Library proposes an update to the existing Managed Skill. Applying that update replaces the current Skill state and creates a pre-update Skill Snapshot by default.

Fork is not import, sync, mirror, or upstream tracking. The product stance is that users should review, curate, and maintain the skills they make available to agents.

### Origin Comparison

Origin Comparison is a lightweight review workflow that compares a Managed Skill with current content available from its Skill Origin.

For the current design horizon, GitHub-origin comparisons use the repository's default branch and produce a simple diff for user review. Skillpack does not need to model complex refs, branch tracking, merge semantics, or version-control history at this stage.

Accepting an Origin Comparison updates the Managed Skill's current state. For existing Managed Skills, the system creates a pre-update Skill Snapshot by default before applying the accepted update.

### Skill Snapshot

A Skill Snapshot is a checkpoint of a Managed Skill's state, attached to the stable internal Skill ID.

A Skill Snapshot includes the Skill Name, canonical instruction content, structured metadata, nullable origin, and complete Resource Manifest captured at that moment. Snapshot state is stored as versioned state JSON so future schema changes can be handled explicitly.

Snapshots use system-generated incrementing `snapshot_number` values scoped to one Skill. Snapshot numbers provide a short user- and API-friendly reference such as `Snapshot #3`. `created_at` remains the chronological ordering field.

Snapshots may include:

- `label`: a short title for lists and quick recognition.
- `note`: an optional longer explanation.

Snapshots are created by explicit or protective actions:

- Manual Create Snapshot creates a Snapshot.
- Add to Library updating an existing Managed Skill creates a pre-update Snapshot by default.
- Accepting an Origin Comparison for an existing Managed Skill creates a pre-update Snapshot by default.

The following actions do not create Snapshots by default:

- Creating a Skill
- Editing or PATCHing a Skill
- Renaming a Skill
- Restoring a Snapshot
- Deleting a Skill

Restoring a Skill Snapshot restores the Managed Skill to the captured state, including the captured Skill Name. Restore fails when the captured Skill Name is already used by another Managed Skill in the same user's Library.

### Skill Content and `SKILL.md`

Skillpack's structured Skill state in D1 is canonical for Skill metadata. `SKILL.md` frontmatter is adapter input/output for file-based Agent Skills compatibility.

Resource storage remains content-addressed in R2 by SHA-256. `SKILL.md` remains part of the Skill Resource Manifest alongside attached resources. Whether the stored `SKILL.md` object contains frontmatter is not the source of truth for metadata; structured Skill state wins.

Structured reads return Skill state as fields such as name, description, metadata, content, and resources. Rendered `SKILL.md` is produced only when an adapter, export path, or compatibility surface explicitly needs a full Skill file. Rendering uses D1 metadata as canonical frontmatter and normalized instruction content.

### Skill Location

A Skill Location is an agent-facing private locator derived from Skill Name within an authorized user context:

```text
skill://{skillName}/SKILL.md
```

Skill Locations resolve to the current Managed Skill state at read time. Skillpack exposes stable current-state MCP resource locators and leaves historical version pins out of Skill Locations.

Skill Locations are server-local MCP resource locators. The segment after `skill://` is the Skill Name in Skillpack's single-segment skill namespace. Agents and harnesses resolve Skill Locations through Skillpack APIs, MCP resources, MCP tools, extension tools, or future delivery interfaces in an authorized user context. The same Skill Name may exist in different users' Libraries; authorization determines which Managed Skill is resolved.

### Skill Trust

Skill Trust is curation and safety metadata maintained for a Managed Skill, including provenance, review signals, Snapshot history, and risk metadata. A separate approved/published pointer can be added later if the product introduces review gates.

User review is a product workflow that guides responsible skill use. The backend does not need a draft/approval state machine for the current pivot.

### Skill Set

A Skill Set is a user-curated collection of that user's Managed Skills intended for an agent, project, workflow, or runtime context.

Skill Sets express the complete skills collection a user wants to make available for a given use. Skill Set membership should reference Managed Skills by Skill Name in public contracts and by Skill ID internally where useful. Skill Set delivery resolves current Skill state unless a future ADR introduces a separate release/publish concept.

Skill Set design deserves its own follow-up design pass and is deferred from this ADR's implementation scope.

### Skill Delivery

Skill Delivery is the agent-facing act of making Managed Skills available to an agent runtime through Skillpack-mediated resolution interfaces.

Delivery resolves Skill Locations to current Managed Skill state. Agent sessions are generally short-lived, and current-state delivery matches user expectation: agents use the Skill as currently managed in the user's Library.

Delivery may resolve individual Managed Skills now and Skill Sets later.

## Alternatives Considered

### Keep aggregator and source-qualified Skill Locations

This was the older north star. It preserved upstream source identity in agent-facing locators, for example `github://{owner}/{repo}/skills/{skillName}/SKILL.md`.

Rejected because it ties agent consumption to upstream identity and makes GitHub repo changes, branch movement, source namespace conflicts, and source-specific revision semantics part of the agent-facing model.

### Keep every save as a Managed Skill Version

This was the previous Managed Skill refactor. It made every durable edit create a complete version snapshot and made the latest version the effective Skill state.

Rejected because it makes version history the primary write path. Skillpack needs current-state management first. Snapshots remain available for explicit checkpoints and protective pre-update restore points.

### Keep stable delivery pins

This would preserve `skill://{skillName}/SKILL.md?version={number}` so agents can resolve historical content.

Rejected because stable pins add read-path, cache, API, UI, and mental-model complexity. Agent sessions are generally short-lived, and current-state Skill Delivery better matches the product model.

### Keep Skill Name immutable

This would preserve Skill Name as a creation-time operation identity and require creating a new Skill to change the name.

Rejected because rename is a natural management operation. Skill ID is the stable internal identity; Skill Name is the mutable user-facing operation identity.

### Store Snapshots as normalized duplicate tables

This would create `skill_snapshots` and `skill_snapshot_resources` tables mirroring the current Skill tables.

Rejected because duplicated schema creates drift when Skill state evolves. Snapshot state JSON with a `state_version` field gives a clearer compatibility boundary for historical state.

### Store `SKILL.md` body outside the Resource Manifest

This would move the `SKILL.md` content pointer to the `skills` table and keep `skill_resources` for attached resources only.

Rejected because it creates a larger divergence between `SKILL.md` and other Skill files. Keeping `SKILL.md` in the Resource Manifest preserves unified content-addressed resource handling while D1 remains canonical for structured metadata.

### Use internal Skill IDs as public identity

This approach would make internal Skill IDs part of API paths and Skill Locations.

Rejected because public numeric or opaque IDs are harder for users and agents to reason about than Skill Names, and numeric IDs increase enumeration concerns in a multi-user system. Skill IDs remain internal storage identities, while `(owner, Skill Name)` uniqueness provides public operation identity.

### Allow duplicate names inside one user's Library

This approach would keep Skill Name as weak display metadata.

Rejected because Add to Library, user selection, Skill Set composition, and Skill Location resolution need a predictable target within one user's Library.

## Consequences

- `skills` becomes the current-state table instead of an identity shell.
- Skill Name becomes mutable and user-scoped unique.
- Public API routes continue to address Skills by Skill Name, for example `/api/v1/skills/{skillName}`.
- Public API responses should not expose Skill ID.
- API routes must scope Managed Skill reads and writes to the authenticated user. Cross-user access returns not found.
- Stable delivery pins are removed from Skill Locations and delivery APIs.
- `skill_versions` is replaced by `skill_snapshots`.
- PATCH updates the Managed Skill current state directly.
- Manual Create Snapshot copies the current Skill state into Snapshot state JSON.
- Add to Library updates existing Skills by replacing current state after review and creating a pre-update Snapshot by default.
- Restore Snapshot replaces current Skill state from Snapshot state JSON and restores the captured Skill Name.
- Restore Snapshot fails on Skill Name conflicts.
- `skill_origins` table can be removed; origin becomes nullable structured JSON on current Skill state and inside Snapshot state JSON.
- Resource storage remains content-addressed by SHA-256 in R2.
- `SKILL.md` remains represented in the Resource Manifest; D1 structured metadata remains canonical over stored frontmatter.
- Rendered `SKILL.md` is an explicit adapter/export output.
- User-facing source actions should say Add to Library even when internal APIs and domain code still use Fork.
- Origin Comparison is a diff-oriented review aid, not sync, merge, or upstream tracking.
- Skill Set needs a separate design pass before persistence or delivery behavior is implemented.

## Non-goals

This ADR does not design:

- Skill Set schema, APIs, delivery policy, or UX
- Workspace, team, organization, and shared-library ownership
- Full GitHub indexing, authentication, rate-limit handling, or repository traversal
- Complex Git refs, branch tracking, merge semantics, or upstream history modeling
- npm source support
- Export/package/filesystem installation modes
- A backend draft/approval state machine for user review
- Alias or redirect behavior for renamed Skill Names
- A full audit log of every edit

## Implementation Plan

### 1. Update shared API contracts

Affected files:

- `packages/contracts/src/skills/*`
- `packages/core/src/primitives.ts`

Required changes:

- Replace version terminology with Snapshot terminology where history is exposed.
- Remove `version` pins from Skill read and resource read contracts.
- Remove `currentVersion` from list and catalog responses, or replace it with Snapshot summary only where the UI needs it.
- Add Snapshot create/list/restore request and response schemas.
- Add rename support to PATCH or a dedicated rename route.
- Keep Skill Name as public operation identity.
- Keep Skill ID out of public API responses.
- Preserve structured Skill fields and `content` as the instruction content field.

Verification:

- Shared schemas expose Skill Name as public operation identity and do not expose Skill ID.
- Shared schemas do not expose source-qualified identity, handle, or stable delivery pins.
- PATCH schemas update current Skill state directly.
- Snapshot schemas use `snapshotNumber`, `label`, `note`, and whole-state semantics.

### 2. Migrate the database model

Affected files:

- `apps/skillpack/server/db/schema.ts`
- `apps/skillpack/migrations/*`
- `apps/skillpack/server/modules/skills/repository.ts`

Required changes:

- Move current state fields onto `skills`: description, license, compatibility, allowed tools, metadata JSON, origin JSON.
- Keep `(owner_user_id, name)` unique.
- Make Skill Name mutable through controlled updates.
- Keep `skill_resources` as the current Resource Manifest table, keyed to `skill_id`, including `SKILL.md`.
- Replace `skill_versions` with `skill_snapshots`.
- Store Snapshot state as `state_json` plus `state_version`.
- Add `snapshot_number`, optional `label`, optional `note`, and `created_at` to Snapshots.
- Enforce `(skill_id, snapshot_number)` uniqueness.
- Remove `skill_origins`; store origin as JSON on Skill state and in Snapshot state JSON.

Verification:

- Managed Skills can have duplicate names across users but not within one user's Library.
- Managed Skills are queryable internally by Skill ID and publicly by Skill Name within owner scope.
- PATCH changes current state without creating a Snapshot.
- Snapshot create copies whole current state, including Skill Name and Resource Manifest.
- Restore copies Snapshot state back to current Skill state and blocks name conflicts.

### 3. Update Skill Location parsing and generation

Affected files:

- `apps/skillpack/server/modules/mcp/route.ts`
- `packages/pi-extension/src/skill-location.ts`
- skills presenter and delivery helpers

Required changes:

- Generate Skill Location as `skill://{skillName}/SKILL.md`.
- Parse Skill Locations as SEP-2640 resource locators and derive Skill Name from the first skill-path segment.
- Remove `?version=` parsing from delivery locators.
- Remove pinned resource URI behavior unless a future protocol-specific need introduces a new explicit concept.

Verification:

- `skill://demo-skill/SKILL.md` resolves Skill Name `demo-skill` in the authorized user's Library.
- `skill://demo-skill/SKILL.md?version=2` is not accepted as current Skill Delivery identity.
- `github://...` is not part of agent-facing managed skill resolution.

### 4. Update backend routes and services

Affected files:

- `apps/skillpack/server/modules/skills/route.ts`
- `apps/skillpack/server/modules/skills/service.ts`
- `apps/skillpack/server/modules/skills/repository.ts`
- `apps/skillpack/server/modules/skills/resource-manifest.ts`
- `apps/skillpack/server/modules/skills/errors.ts`

Required changes:

- `GET /api/v1/skills/{skillName}` returns current Skill state.
- `PATCH /api/v1/skills/{skillName}` updates current Skill state directly.
- Add explicit Snapshot endpoints, such as:

```text
GET  /api/v1/skills/{skillName}/snapshots
POST /api/v1/skills/{skillName}/snapshots
POST /api/v1/skills/{skillName}/snapshots/{snapshotNumber}/restore
```

- Remove public `version` query parameters from current read/resource routes.
- Resource reads resolve current Skill state by Skill Name and resource path.
- Add rename handling with same-user name uniqueness checks.
- Implement Add to Library update as review/apply flow that creates pre-update Snapshot by default.
- Store resource content in content-addressed R2 objects:

```text
objects/sha256/{sha256}
```

Verification:

- `GET /api/v1/skills/{skillName}` returns current state without a version number.
- PATCH does not create a Snapshot.
- Manual Snapshot create persists state JSON and manifest shas.
- Restore Snapshot restores name, metadata, origin, content, and resources.
- Restore Snapshot returns conflict when captured name is used by another Skill.

### 5. Update frontend routing and skill feature usage

Affected files:

- `apps/skillpack/client/routes/_authenticated/skills.$skillName.tsx`
- `apps/skillpack/client/features/skills/api/*`
- `apps/skillpack/client/features/skills/components/*`
- `apps/skillpack/client/features/skills/views/*`

Required changes:

- Navigate by Skill Name.
- Remove `version` search parameter behavior.
- Replace Versions UI with Snapshots UI.
- Keep editing current Skill state through structured fields plus content/resources.
- Add rename UI.
- Add manual Create Snapshot UI.
- Restore Snapshot should handle name conflict errors clearly.
- Keep review UX concerns in frontend flows; avoid backend draft approval for this pivot.

Verification:

- Skill list links route to `/skills/{skillName}`.
- Detail pages load current Skill state.
- Edits save current state directly.
- Snapshot list, create, and restore flows use Snapshot terminology.
- Rename updates route to the new Skill Name after success.

### 6. Update delivery surfaces

Affected files:

- `docs/skill-delivery-design.md`
- `apps/skillpack/server/modules/mcp/route.ts`
- `packages/pi-extension/src/*`

Required changes:

- Catalog entries contain Skill Name, description, and `skill://{skillName}/SKILL.md` locator.
- Remove current numeric version from catalog entries.
- Remove version-pinned MCP resources and resource URIs.
- Keep rendered `SKILL.md` output as an explicit compatibility behavior when a delivery surface needs a full Skill file.
- Structured delivery surfaces may return structured Skill state directly.

Verification:

- Pi extension and MCP list current Skill catalog without version pins.
- `skillpack_read` reads current Skill state.
- Attached resource reads use current Skill state and resource path.

### 7. Design Skill Set separately

Create a follow-up design artifact for Skill Set.

The follow-up should decide:

- Skill Set identity and naming
- Membership model
- Ordering model
- Whether membership stores Skill Name, Skill ID, or both
- Delivery APIs and locator shape
- UI flows for composing and activating Skill Sets

Verification:

- A separate Skill Set plan or ADR exists before implementing Skill Set persistence or delivery behavior.

## Verification Checklist

- [ ] `CONTEXT.md` uses Managed Skill, Skill Origin, Fork, Origin Comparison, Skill ID, Skill Name, Skill Snapshot, Skill Set, and Skill Delivery consistently.
- [ ] No primary skill API depends on `source_type`, `handle`, public Skill ID, or version pin.
- [ ] Skill Location generation uses `skill://{skillName}/SKILL.md` only.
- [ ] PATCH updates current Skill state without creating a Snapshot.
- [ ] Manual Snapshot create captures whole Skill state.
- [ ] Add to Library update creates a pre-update Snapshot by default.
- [ ] Restore Snapshot restores captured Skill Name and blocks name conflicts.
- [ ] Managed Skill names can duplicate across users but not within one user's Library.
- [ ] Resource storage and resource manifests include `SKILL.md` and attached resources under the current Skill state.
- [ ] Snapshot state JSON captures Resource Manifest shas and uses a `state_version`.
- [ ] GitHub-origin functionality is modeled as fork/provenance/comparison rather than sync/import/mirror.
- [ ] Skill Set implementation waits for a separate design pass.
- [ ] `pnpm typecheck` passes after implementation.
- [ ] `pnpm build` passes after implementation.

## Follow-up Actions

- Redesign and implement the Skill-first database migration.
- Redesign shared schemas and API routes around current Skill state and Snapshots.
- Update frontend routes and API hooks to remove version pins and expose Snapshot flows.
- Update Pi extension and MCP delivery surfaces to remove stable version pins.
- Update fork/provenance modeling to use origin JSON on Skill state.
- Add simple Origin Comparison against the GitHub repository default branch.
- Create a separate Skill Set design.
- Keep R2 storage content-addressed by SHA-256 unless a future ADR chooses per-skill object paths.
