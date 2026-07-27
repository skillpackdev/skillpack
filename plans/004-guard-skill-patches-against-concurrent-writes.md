# Plan 004: Guard Skill patches against concurrent head changes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f999925..HEAD -- apps/skillpack/server/modules/mcp/tools/manage-skill.ts apps/skillpack/server/modules/skills/types.ts apps/skillpack/server/modules/skills/errors.ts apps/skillpack/server/modules/skills/service.ts apps/skillpack/server/modules/skills/service.test.ts apps/skillpack/server/modules/skills/repository.ts apps/skillpack/server/modules/skills/repository.test.ts apps/skillpack/server/modules/skills/route.ts apps/skillpack/server/modules/skills/route.test.ts apps/skillpack/server/app.test.ts apps/skillpack/server/mcp.e2e.test.ts`
> Confirm Plans 001–003 are marked `DONE`. Then verify predecessor state:
> `rg -n 'handleDelete|case "delete"' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> returns no matches; `rg -n 'frontmatter: (parsed|validation\.parsed)\.frontmatter' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> finds the two Plan 002 forwarding sites; and `rg -n 'operation: manageSkillOperationSchema|inputSchema: manageSkillMcpSchema' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> finds the Plan 003 nested schema sites. Those predecessor changes and their
> corresponding tests are the only allowed drift in overlapping files. Stop on
> any other semantic mismatch in the repository write path or route error map.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-remove-mcp-delete-action.md`, `plans/002-preserve-skill-frontmatter.md`, `plans/003-use-action-specific-manage-skill-schema.md`
- **Category**: bug
- **Planned at**: commit `f999925`, 2026-07-10

## Why this matters

MCP text patch performs a read-modify-write across separate service calls. A
concurrent write can change the target after it was read; the later patch then
writes stale content as a new head and reverts the intervening change. Skill
Version History preserves the overwritten node, yet the current Managed Skill
still becomes incorrect. The repository must condition every head move on the
head used to prepare the new version, while MCP targeted edits must also verify
the target file digest they read.

## Current state

Relevant files:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts` — reads target content and later calls `patchSkillByName`.
- `apps/skillpack/server/modules/skills/types.ts` — internal patch input types.
- `apps/skillpack/server/modules/skills/service.ts` — reads current state, prepares R2 objects/manifests, then calls the repository.
- `apps/skillpack/server/modules/skills/repository.ts` — appends a Skill Version and moves `skills.head_version_pk` in a D1 batch.
- `apps/skillpack/server/modules/skills/errors.ts` — closed union of domain error codes.
- `apps/skillpack/server/modules/skills/route.ts` — maps domain errors to HTTP statuses.
- Matching `*.test.ts` files — unit, repository/Miniflare, route, and MCP regression coverage.

MCP Skill-file patch currently reads then writes without an expected digest:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:255-277
const activation = await context.skillService.readSkillActivationByName(
  input.name
);
const patchResult = applyTextPatch(
  activation.skillFileContent,
  input.old_string,
  input.new_string,
  input.replace_all
);
// ...
const result = await context.skillService.patchSkillByName(
  input.name,
  patchInput
);
```

Attached files have the same gap:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:286-310
const file = await context.skillService.readSkillTextFileByName({
  path: targetPath,
  skillName: input.name,
});
// apply patch to file.content
const result = await context.skillService.patchSkillByName(input.name, {
  deleteResourcePaths: [],
  upsertResources: [
    {
      content: patchResult.content,
      mediaType: file.resource.mediaType,
      path: targetPath,
    },
  ],
});
```

The service reads a head, prepares the next state, then delegates:

```ts
// apps/skillpack/server/modules/skills/service.ts:275-286
const state = await this.repository.findSkillWithCurrentResourcesByName(name);
// ...
return await this.patchResolvedSkill(state, input);
```

```ts
// apps/skillpack/server/modules/skills/service.ts:323-340
const resources = await this.resourceManifest.patchManifest(
  currentResources,
  input
);
const updatedSkill = await this.repository.updateSkillState(
  {
    // prepared state
    skillPk: skill.pk,
  },
  now
);
```

The repository re-reads and later moves the head by PK only:

```ts
// apps/skillpack/server/modules/skills/repository.ts:241-259
const currentSkill = await this.findSkillByPk(input.skillPk);
// ...
return await this.appendSkillVersion(currentSkill, /* ... */, now);
```

```ts
// apps/skillpack/server/modules/skills/repository.ts:548-551
const headUpdate = this.db
  .update(skillsTable)
  .set({ headVersionPk: createdVersionPk })
  .where(sqlEq(skillsTable.pk, currentSkill.pk));
```

The D1 architecture constraint in `docs/backend-architecture.md`: current-state
writes use `D1Database.batch()` and SQL subqueries. Do not introduce Drizzle
`transaction()`; D1 rejects the SQL transaction/savepoint statements emitted by
that adapter.

The version model requires:

- each new node's `parent_pk` equals the head used to prepare it;
- the head moves only when that expected head remains current;
- a conflict appends no orphan version;
- callers receive a stable domain conflict code.

A read-only Miniflare/D1 probe against the current migrations at commit
`f999925` verified the proposed CAS primitive. Inserting a version whose
non-null `skill_pk` is a scalar subquery guarded by a stale head produced:

```text
D1_ERROR: NOT NULL constraint failed: skill_versions.skill_pk:
SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)
```

The containing `db.batch()` rolled back completely: the version list retained
only the root and `head_version_pk` stayed unchanged. Use the stable message
fragment `NOT NULL constraint failed: skill_versions.skill_pk` as the narrow
predicate, matching the repository's existing message-based unique-constraint
classification style. The permanent Miniflare regression must prove the same
rollback before this plan is complete.

## Commands you will need

| Purpose          | Command                                                                                                                      | Expected on success      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Install          | `pnpm install --frozen-lockfile`                                                                                             | exit 0                   |
| Repository tests | `pnpm --filter @skillpack/app exec vitest run server/modules/skills/repository.test.ts`                                      | all selected tests pass  |
| Service tests    | `pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts`                                         | all selected tests pass  |
| Route/MCP tests  | `pnpm --filter @skillpack/app exec vitest run server/modules/skills/route.test.ts server/app.test.ts server/mcp.e2e.test.ts` | all selected tests pass  |
| Check            | `pnpm check`                                                                                                                 | exit 0, no findings      |
| Typecheck        | `pnpm typecheck`                                                                                                             | exit 0, no errors        |
| Full tests       | `pnpm test`                                                                                                                  | all workspace tests pass |
| Build            | `pnpm build`                                                                                                                 | exit 0                   |

## Suggested executor toolkit

- Read `.agents/skills/cloudflare/SKILL.md` and `.agents/skills/workers-best-practices/SKILL.md` before changing D1 write behavior.
- Read `.agents/skills/hono/SKILL.md` before adding the HTTP 409 route regression.
- Consult `docs/backend-architecture.md` and ADR-0008/ADR-0009 before implementation.

## Scope

**In scope**:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
- `apps/skillpack/server/modules/skills/types.ts`
- `apps/skillpack/server/modules/skills/errors.ts`
- `apps/skillpack/server/modules/skills/service.ts`
- `apps/skillpack/server/modules/skills/service.test.ts`
- `apps/skillpack/server/modules/skills/repository.ts`
- `apps/skillpack/server/modules/skills/repository.test.ts`
- `apps/skillpack/server/modules/skills/route.ts`
- `apps/skillpack/server/modules/skills/route.test.ts`
- `apps/skillpack/server/app.test.ts`
- `apps/skillpack/server/mcp.e2e.test.ts` only when needed for the structured conflict result
- `plans/README.md` (status update only)

**Out of scope**:

- D1 schema and migrations
- Durable Objects, queues, locks, or a new coordination service
- Public `expectedVersion` fields in REST/MCP request contracts
- Automatic retries after a conflict
- Merging two concurrent textual edits
- Changing Version History retention or restore behavior
- Changing whole-file `edit` semantics into a textual merge

## Git workflow

- Suggested branch: `advisor/004-guard-concurrent-skill-patches`
- Prefer two logical commits only when useful: repository CAS + caller propagation/tests. Otherwise use one focused commit.
- Match imperative commit style, e.g. `Guard Skill head updates with optimistic concurrency`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the conflict contract and failing regressions

Add `skill-version-conflict` to `SkillErrorCode` in
`apps/skillpack/server/modules/skills/errors.ts` and add a factory with the
stable, non-internal message `Skill changed since it was read`. Map the code to
HTTP 409 in `apps/skillpack/server/modules/skills/route.ts`.

Add red tests before changing repository behavior:

1. In `repository.test.ts`, create one Skill and capture its root head. Perform one update using that expected head, then attempt a second update using the same stale head.
2. Assert the second update rejects with `code: "skill-version-conflict"`.
3. Assert exactly two versions remain (root + winning update), the losing version ID is absent, and the current head/content belong to the winner.
4. Add a missing-Skill case proving it still returns `skill-not-found`.
5. In `route.test.ts`, mock `patchSkillByName` to throw the conflict and assert HTTP 409 with the existing API error shape.

Use the existing Miniflare D1 setup in `repository.test.ts`; mock-only tests do
not prove rollback.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/modules/skills/repository.test.ts server/modules/skills/route.test.ts`
→ new tests fail because expected-head input and conflict behavior do not exist.

### Step 2: Make repository head movement compare-and-swap

Extend the private `UpdateSkillStateInput` with required
`expectedHeadVersionPk: number`. Replace the implicit `SkillRow` dependency in
the append helper with this explicit target shape:

```ts
interface ExpectedSkillHead {
  expectedHeadVersionPk: number;
  skillPk: number;
}

private async appendSkillVersion(
  expectedHead: ExpectedSkillHead,
  input: AppendSkillVersionInput,
  now: Date
) {
  // guarded insert + identity/head updates
}
```

`updateSkillState` must call it with:

```ts
return await this.appendSkillVersion(
  {
    expectedHeadVersionPk: input.expectedHeadVersionPk,
    skillPk: input.skillPk,
  },
  {
    // existing append payload
  },
  now
);
```

`restoreVersion` already resolves a current owned Skill; pass its `pk` and
`headVersionPk` through the same `ExpectedSkillHead` shape. Remove the unguarded
`findSkillByPk` re-read from `updateSkillState`.

Implement the atomic batch as follows:

1. Set new version `parentPk` to `expectedHead.expectedHeadVersionPk`.
2. Resolve version `skillPk` through a parameterized scalar subquery selecting `skills.pk` only when `pk`, `owner_user_id`, and `head_version_pk` match `ExpectedSkillHead`.
3. Write that subquery into non-null `skill_versions.skill_pk`. A stale head yields NULL and aborts the D1 batch before any version is committed.
4. Filter both Skill identity update and head update by the same PK, owner, and expected head.
5. Keep the existing created-version-ID subquery as the new head value.
6. Add a narrow classifier matching only `NOT NULL constraint failed: skill_versions.skill_pk`. On that failure, re-read the owned Skill after rollback: missing → `skill-not-found`; present with another head → `skill-version-conflict`.
7. Preserve duplicate Skill Name mapping and rethrow every unrelated persistence error.

Keep insert, identity update, and head update in one `db.batch()`. Use
parameterized Drizzle `sql` fragments. Do not use string-built SQL or Drizzle
`transaction()`.

Every `updateSkillState` caller must provide the head used to prepare its state:

- `SkillService.patchResolvedSkill` → `state.skill.headVersionPk`;
- existing-Skill Fork update → `existingSkill.headVersionPk`;
- repository/service test helpers and direct calls → their captured head;
- restore → the current Skill passed to `appendSkillVersion`.

**Verify**:

1. `pnpm --filter @skillpack/app exec vitest run server/modules/skills/repository.test.ts server/modules/skills/service.test.ts` → all selected tests pass.
2. The stale-write test proves the exact conflict code, unchanged head, and no orphan version.
3. `rg -n 'NOT NULL constraint failed: skill_versions\.skill_pk' apps/skillpack/server/modules/skills/repository.ts` → exactly the narrow conflict classifier is present.

### Step 3: Guard MCP targeted patches with the digest they read

Extend only internal `PatchSkillServiceInput` in `types.ts`:

```ts
expectedSkillFileSha256?: string;
expectedResource?: {
  path: string;
  sha256: string;
};
```

Keep these fields out of `@skillpack/contracts`. In
`SkillService.patchSkillByName`, after reading current state and before any R2
write:

- compare `expectedSkillFileSha256` with `state.skill.skillFileSha256`;
- find `expectedResource.path` in the current manifest and compare its SHA-256;
- throw `skill-version-conflict` on a missing or mismatched target;
- perform no storage/repository write after a failed precondition.

In `manage-skill.ts`, preserve Plan 003's nested `operation` contract and pass:

- Skill-file patch → `expectedSkillFileSha256: activation.skill.skillFileSha256`;
- attached-file patch → `expectedResource: { path: file.resource.path, sha256: file.resource.sha256 }`;
- `remove_file` → the matching activation resource's path and SHA-256.

Full `edit` and blind `write_file` do not add target-digest preconditions; the
repository CAS still protects their final head move.

Add service tests for Skill-file and resource mismatch. Assert
`storeSkillFile`, `patchManifest`, and `updateSkillState` remain uncalled after a
failed precondition. Add explicit `app.test.ts` handler tests that assert the
exact second argument passed to `patchSkillByName` for:

1. canonical Skill-file `patch`;
2. attached-file `patch`;
3. `remove_file`.

These propagation assertions are required; a mocked conflict-formatting test
alone does not prove the MCP handler supplies preconditions. Also assert a
mocked conflict returns MCP `isError: true` and structured JSON containing
`ok: false` and `error.code: "skill-version-conflict"`.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts server/app.test.ts server/mcp.e2e.test.ts`
→ all selected tests pass, including exact digest propagation assertions.

### Step 4: Verify every write caller and error boundary

Search every `updateSkillState(` call and every direct `appendSkillVersion(`
call. Each update must supply the expected head used to prepare state; each
append must receive `ExpectedSkillHead`.

**Verify**:

1. `rg -n 'updateSkillState\(' apps/skillpack/server -g '*.ts'` → every listed call includes `expectedHeadVersionPk`.
2. `rg -n 'appendSkillVersion\(' apps/skillpack/server/modules/skills/repository.ts` → only the helper plus guarded update/restore call sites.
3. `rg -n 'skill-version-conflict' apps/skillpack/server` → error definition, repository/service guards, HTTP 409 mapping, MCP formatting test, and regressions are present.
4. `pnpm typecheck` → exit 0.

### Step 5: Run repository gates

**Verify**:

1. `pnpm check` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm test` → all tests pass.
4. `pnpm build` → exit 0.
5. `git diff --check` → no output.
6. `git status --short` → only in-scope files and the permitted plan status update are listed.

## Test plan

Required new regressions:

- repository rejects the second of two writes prepared from the same head;
- rejected stale write creates no orphan Skill Version;
- repository distinguishes missing Skill from stale head;
- service rejects a stale canonical Skill-file digest before storage work;
- service rejects a stale attached-resource digest before storage work;
- `remove_file` cannot remove a concurrently replaced resource;
- REST returns HTTP 409 for the domain conflict;
- MCP returns structured `skill-version-conflict` tool output;
- normal sequential create/patch/edit/write/remove, fork, restore, and version-history tests remain green.

Use real Miniflare D1 for the atomic no-orphan proof. Mock-based unit tests alone are
insufficient for the repository guarantee.

## Done criteria

- [ ] Every current-state repository write compares the expected and actual head.
- [ ] A stale write stores no Skill Version and does not move the head.
- [ ] New version `parentPk` equals the expected head used to prepare it.
- [ ] Targeted MCP patch/remove operations validate the digest they read.
- [ ] Conflict returns `skill-version-conflict`; REST maps it to 409 and MCP returns a structured error.
- [ ] No public request schema, D1 schema, or migration changes are present.
- [ ] New repository, service, route, and MCP regressions pass.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `git diff --check` produces no output.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 004 `DONE`.

## STOP conditions

Stop and report back if:

- D1/Miniflare does not roll back the whole batch when the guarded non-null
  `skill_versions.skill_pk` subquery yields no row.
- The stale-write test leaves an orphan version under any interleaving.
- Reliable CAS requires a schema migration, Durable Object, explicit public
  version parameter, or distributed lock.
- The specific D1 constraint error cannot be distinguished safely from unrelated
  persistence failures.
- Plans 001–003 are incomplete or their done criteria regress.
- A verification command fails twice after a focused fix.

## Maintenance notes

Any future method that prepares a Skill Version from current state must carry the
head used for preparation into the repository CAS. Targeted read-modify-write
operations should additionally carry the target object's digest. Reviewers
should scrutinize atomicity tests whenever D1, Drizzle, or the version write
shape changes; successful typechecking does not prove that a stale batch leaves
no orphan node.
