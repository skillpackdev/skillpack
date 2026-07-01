---
status: proposed
date: 2026-07-01
decision-makers: Sean
consulted: Current Skillpack codebase, ADR-0001, ADR-0004, ADR-0007, Obsidian File Recovery design, MCP authorization guidance
informed: Future Skillpack maintainers and coding agents
---

# ADR-0008: Restructure Skill Storage as a Content-Addressed Version DAG

Skillpack restructures Skill storage from a single mutable Skill row into a
content-addressed version DAG with a mutable head pointer and named tags — a
mini-Git model. Enabling agents to author and iterate on Skills through `/mcp`
is the trigger for this work, but the redesign is not an MCP feature: it makes
every write surface (REST included) safe and non-destructive, unifies
versioning across the system, and folds the old parallel snapshot mechanism into
one coherent model.

## Context

The trigger for this decision is agent authoring over MCP. ADR-0007 made `/mcp`
read-only: it exposes `list`/`read` tools and resolves current Managed Skill
state by Skill Name under the `skills:read` scope. Agents can consume Skills but
cannot author or iterate on them remotely. Designing that write path forced a
harder question — is the current storage model safe to write against at all? —
and the answer reshaped the data model for the whole system, not just for MCP.

Self-iteration is the missing half of the loop. In first-principles terms,
self-iteration is CRUD minus Delete: read the current state, improve it, write
the new state. Versioning and backup are **orthogonal** to that loop, not part
of it. Forward-correction already self-heals most mistakes — an agent that
writes a bad SKILL.md can simply write a better one. The one failure that
forward-correction cannot undo is destruction of **non-regenerable content**:
resource files (attachments) that are overwritten or dropped and cannot be
reconstructed from context. That single risk is what justifies a recovery net.

The current storage model works against a safe write path:

- `skills` is a single mutable row holding both identity (`name`,
  `owner_user_id`) and content (`description`, `license`, `compatibility`,
  `allowed_tools`, `metadata`, `origin`).
- `skill_resources` is the live manifest (`skill_id → path → sha256 → size →
  media_type`); a write **destructively replaces** the manifest mapping. R2
  blobs are content-addressed and never deleted, but the mapping to them is
  overwritten in place.
- `skill_snapshots` is a parallel, manually-triggered backup mechanism
  (`snapshot_number`, `label`, `note`, a self-contained `state_json` manifest
  blob) wired to REST `/snapshots`, a presenter, and a client
  snapshots sheet.

We considered and rejected two shapes for the write path before landing here:

- **Auto-snapshot on every update.** Abandoned. Agents iterate heavily and may
  call update several times for different resources in one work session. Every
  update would mint a half-baked intermediate snapshot — noise that is also a
  dangerous rollback target. "Backup" does not belong inside the iteration loop.
- **Explicit tag/commit tool as the safety mechanism.** Set aside. It pushes
  version hygiene onto the agent and still leaves the destructive-overwrite risk
  in place between commits.

The Obsidian File Recovery design informed the final direction: keep
**full-content snapshots** (not diffs), taken **only on real change**, stored
**out-of-band**, **default-on**, and **time-expiring**. Its core lesson is to
stop hunting for "meaningful version boundaries" and instead treat history as
cheap tape that expires. Our model applies the same philosophy, expressed as a
version DAG rather than a flat snapshot list.

## Decision

### 1. Add a `skills:write` scope and a whole-library write capability

- Add `skills:write` alongside `skills:read`.
- Write permission covers the user's **whole** Skill Library, not only
  agent-created Skills.
- OAuth consent grants `skills:write` by default (simpler consent, one grant).
  API-key auth also carries write permission.
- MCP middleware resolves a `canWrite` capability into request context:
  - API key → full permission, including write.
  - OAuth token → `canWrite` iff the token carries `skills:write`.
  - Write tools error clearly when `canWrite` is false.

### 2. Expose authoring tools over MCP

- `create_skill` and `update_skill` (patch semantics), reusing the existing
  `createSkillSchema` / `patchSkillSchema` contracts.
- **No** `delete_skill` over MCP. **No** snapshot/tag tool over MCP in v1.
- Update the MCP server `instructions` so agents know they can create and
  iterate Skills, and understand that update is patch-based and self-correcting.

### 3. Restructure storage as a content-addressed version DAG (mini-Git)

The layers map onto Git: an R2 blob (addressed by sha256) is the object store; a
version node is a commit; `parent_id` is the commit DAG; the head pointer and
tags are refs.

**`skills` — identity plus head pointer only.** Content fields move out.

```
skills(
  id, name, owner_user_id,
  head_version_id NOT NULL REFERENCES skill_versions(id),
  created_at, updated_at,
  UNIQUE(owner_user_id, name)
)
```

`head_version_id` is a first-class NOT NULL column. This lets the database
enforce the real invariant: every Skill has **exactly one** head, and that head
**must exist**. A refs table could only enforce "at most one" via a unique
index; it cannot enforce "exactly one, and present."

**`skill_versions` — immutable DAG nodes carrying content.**

```
skill_versions(
  id, skill_id, parent_id NULL REFERENCES skill_versions(id),
  description, license, compatibility, allowed_tools, metadata, origin,
  author_kind ('user' | 'agent' | 'system'), token_id NULL,
  created_at
)
```

`parent_id NULL` marks a DAG root (initial create). Provenance
(`author_kind`, `token_id`, `created_at`) records who wrote each node.

**`skill_version_resources` — flat manifest pointer rows, no dedup.**

```
skill_version_resources(
  version_id, path, sha256, media_type, size,
  UNIQUE(version_id, path)
)
```

Each version owns a full copy of its manifest pointer rows. We deliberately do
**not** dedup manifests across versions: real iterations almost always change
SKILL.md, so a whole-manifest content hash would rarely match an adjacent
version and the dedup would seldom hit. This also rules out the Merkle-tree
manifest-addressing and blob delta-compression variants for v1 (see
Alternatives).

**`skill_refs` — named tags only (head is not a ref).**

```
skill_refs(
  skill_id, name, version_id REFERENCES skill_versions(id),
  created_at,
  UNIQUE(skill_id, name)
)
```

Head and tag are different things and are modeled separately, not unified under
a `kind` column. Head is a **moving work pointer** (it advances on every write);
a tag is a **pinned named snapshot** (fixed once created). Tagging the current
head is simply: insert a ref pointing at whatever `skills.head_version_id`
currently references.

**No materialized `skill_resources` view.** The live manifest is exactly
`skill_version_resources WHERE version_id = head_version_id`. Reading the head
manifest is a single index lookup on `version_id`; it costs the same as a
dedicated live-manifest table and does not "touch history" in any meaningful
sense — head rows just happen to share a table with historical rows, separated
by the `version_id` index. Keeping a separate live table would only add a
second manifest write per update and a dual-write consistency surface, with no
read benefit. D1/SQLite has no true materialized views anyway, so such a table
could only be a hand-maintained redundant copy. It is therefore removed.

Removing the live-manifest copy is what makes the head-as-column choice pay off:
the hot read becomes `skills` (one row by name, yielding `head_version_id`) →
`skill_version_resources` (index lookup). If head lived only in a refs table,
that read would take an extra hop through refs.

### 4. Write path

An update is append-only and atomic:

- Insert a new `skill_versions` node with `parent_id = current head`.
- Insert its `skill_version_resources` manifest rows.
- Move `skills.head_version_id` to the new node.

All in one D1 `batch`. There is **no destructive overwrite** of the previous
version's content or manifest; the old node remains reachable through the DAG.

### 5. Read path

Resolve `head_version_id` from `skills`, then read
`skill_version_resources`/`skill_versions` for that id. The hot read path never
scans history and never joins through refs.

### 6. Retention policy (defined) and GC mechanism (deferred)

- **Policy (decided):** ref-reachable versions are kept forever — the head of
  each Skill and every tagged version. Unreferenced intermediate versions older
  than **30 days** are eligible for garbage collection. 30 days is confirmed
  sufficient as a recovery window.
- **Mechanism (deferred):** v1 does **not** implement GC. D1-side manifest
  pruning is not yet triggered, and R2 blobs are **never deleted** in v1 —
  orphan-blob reclamation (refcounting / mark-sweep) is risky and needs its own
  careful design later. Because v1 deletes no blobs, it cannot mis-delete a live
  reference; the risk is zero by construction.
- **Known debt (tracked, not forgotten):** retention is the model's **only**
  growth bound. With the GC mechanism deferred, v1 storage is temporarily
  unbounded. This is acceptable at the current early stage with few users, but
  is recorded here as tracked debt: *retention window = 30 days (decided),
  enforcement = deferred.*

### 7. Pivot: remove the old snapshot mechanism

As an early-stage product we take this as a deliberate pivot rather than a
migration. The `skill_snapshots` mechanism is **removed** and "named snapshot"
is re-expressed as a tag (`skill_refs`). This ADR owns the **data-model**
change: the version DAG, refs, and `restore = move/merge a ref`. Rebuilding a
tag-based snapshot **UI** is orthogonal and may follow later; v1 removes the old
snapshot UI without necessarily shipping the new tag UI in the same batch, to
keep this change bounded.

## Consequences

- Agents gain a safe self-iteration loop over MCP: create and patch Skills, with
  every prior version preserved as a DAG node for recovery.
- Destructive overwrite is eliminated at the storage layer; a bad write is
  always recoverable by walking the DAG (within retention).
- `skills` becomes pure identity plus a head pointer; all content lives in
  immutable version nodes, which dissolves the earlier pre-image/post-image
  debate — "current" is a node, not a mutable row.
- The old `skill_snapshots` table, its REST `/snapshots` surface, presenter,
  `SkillSnapshotStateJson` contract, and the client snapshots sheet are removed
  or reworked (pivot, not migration).
- v1 storage is temporarily unbounded because GC is deferred; this is accepted
  and tracked debt bounded by the decided 30-day retention policy.
- Future doors stay open with no schema change: manifest dedup, Merkle-tree
  manifest addressing, and blob delta compression are all reachable behind the
  version→manifest indirection and the blob storage interface.

## Alternatives Considered

### Auto-snapshot every update

Rejected. Heavy multi-call iteration would mint many half-baked intermediate
snapshots — noise and dangerous rollback targets. Backup does not belong in the
iteration loop.

### Explicit commit/tag tool as the primary safety net

Rejected as the primary mechanism. It offloads version hygiene onto the agent
and leaves destructive overwrite in place between commits. Tags remain in the
model as an optional pinning mechanism, not as the safety net.

### Keep a separate live `skill_resources` manifest table (materialized view)

Rejected. It duplicates `skill_version_resources WHERE version_id = head` with
no read benefit, adds a second manifest write and a dual-write consistency
surface, and D1/SQLite cannot maintain it as a real materialized view.

### Unify head and tags in one refs table (`kind` column)

Rejected. Head is a moving work pointer with an "exactly one, must exist"
invariant best enforced by a NOT NULL column on `skills`; tags are pinned and
optional. A shared `kind` column enforces neither invariant well and conflates
two different concepts.

### Content-address the manifest (Merkle tree) or delta-compress blobs

Deferred, not rejected forever. Iterations mostly change SKILL.md, so
whole-manifest dedup rarely hits adjacent versions, and delta compression adds
complexity disproportionate to early-stage needs. The version→manifest
indirection and the blob storage interface keep both options open for later
without a schema change.

### Expose `delete_skill` over MCP

Rejected for v1. Delete is the one CRUD verb outside the self-iteration loop and
the highest-blast-radius operation; it stays off the agent surface.
