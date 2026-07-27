# Plan 001: Remove destructive Skill deletion from MCP

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f999925..HEAD -- README.md docs/skill-delivery-design.md apps/skillpack/server/modules/mcp/tools/manage-skill.ts apps/skillpack/server/app.test.ts apps/skillpack/server/mcp.e2e.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code. Stop on any semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `f999925`, 2026-07-10

## Why this matters

The branch exposes permanent Managed Skill deletion to every MCP caller with
`skills:write`, including API keys. Deletion removes the Skill identity, Skill
Versions, and Version Labels, so the tool's recoverability promise does not
apply. ADR-0008 records the current proposed design direction to keep deletion
off the MCP agent surface, and the maintainer selected that direction for this
plan because deletion is outside the self-iteration loop and has the highest
blast radius.

## Current state

Relevant files:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts` — defines and dispatches all `manage_skill` actions.
- `apps/skillpack/server/mcp.e2e.test.ts` — proves that an API key can currently delete a Skill through MCP.
- `apps/skillpack/server/app.test.ts` — inspects the MCP tool catalog and is the right place for schema/auth boundary assertions.
- `README.md` and `docs/skill-delivery-design.md` — advertise deletion as part of `manage_skill`.
- `docs/decisions/0008-skill-storage-version-dag.md` — proposed design direction for agent authoring and deletion scope.

Current action and dispatch excerpts:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:15-19
const manageSkillMcpSchema = z.object({
  action: z
    .enum(["create", "patch", "edit", "delete", "write_file", "remove_file"])
```

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:318-328
const handleDelete = async (
  context: SkillpackMcpContext,
  input: ManageSkillInput
) => {
  try {
    await context.skillService.deleteSkillByName(input.name);

    return formatManageSkillSuccess("delete", {
      description: "",
      name: input.name,
    });
```

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:451-456
case "delete": {
  return await handleDelete(context, input);
}
```

The tool currently claims all mutations are recoverable:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:79
"Every successful mutation appends a recoverable version. ...";
```

The proposed design direction states:

```md
<!-- docs/decisions/0008-skill-storage-version-dag.md:311-314 -->

### Expose `delete_skill` over MCP

Rejected for v1. Delete is the one CRUD verb outside the self-iteration loop and
the highest-blast-radius operation; it stays off the agent surface.
```

Repository convention: transport adapters call `SkillService`; business methods
remain in `modules/skills/service.ts`. Keep the existing REST/session deletion
path intact. Match the focused MCP tool registration style in
`apps/skillpack/server/modules/mcp/tools/read-skill.ts`.

Product vocabulary from `CONTEXT.md`: use **Managed Skill**, **Skill Name**, and
**Skill Version History**. Avoid introducing delete-specific snapshot or tag
terminology.

## Commands you will need

| Purpose        | Command                                                                                  | Expected on success      |
| -------------- | ---------------------------------------------------------------------------------------- | ------------------------ |
| Install        | `pnpm install --frozen-lockfile`                                                         | exit 0                   |
| Targeted tests | `pnpm --filter @skillpack/app exec vitest run server/app.test.ts server/mcp.e2e.test.ts` | all selected tests pass  |
| Check          | `pnpm check`                                                                             | exit 0, no findings      |
| Typecheck      | `pnpm typecheck`                                                                         | exit 0, no errors        |
| Full tests     | `pnpm test`                                                                              | all workspace tests pass |
| Build          | `pnpm build`                                                                             | exit 0                   |

## Suggested executor toolkit

- Read `.agents/skills/hono/SKILL.md` before changing `app.test.ts` MCP request coverage.
- Read `.agents/skills/workers-best-practices/SKILL.md` before reviewing the final Worker-facing tool boundary.
- Consult `docs/decisions/0007-skillpack-mcp-delivery-endpoint.md` and `docs/decisions/0008-skill-storage-version-dag.md` before editing.

## Scope

**In scope** (the only source/docs files you should modify):

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
- `apps/skillpack/server/app.test.ts`
- `apps/skillpack/server/mcp.e2e.test.ts`
- `README.md`
- `docs/skill-delivery-design.md`
- `plans/README.md` (status update only)

**Out of scope**:

- `apps/skillpack/server/modules/skills/service.ts`
- `apps/skillpack/server/modules/skills/repository.ts`
- `apps/skillpack/server/modules/skills/route.ts`
- REST `DELETE /api/v1/skills/:skillName`
- OAuth scope definitions and API-key capabilities
- Reintroducing `create_skill` or `update_skill` aliases; the maintainer explicitly accepted direct tool-name cutover for short-lived MCP connections
- A replacement delete scope, confirmation token, soft-delete model, or trash/recovery UI

## Git workflow

- Suggested branch: `advisor/001-remove-mcp-delete-action`
- Use one focused commit after all checks pass; match recent imperative messages such as `Replace MCP create_skill/update_skill with unified manage_skill`.
- Do not push or open a PR unless the operator instructs it.

## Steps

### Step 1: Add regression coverage for the MCP boundary

Update `apps/skillpack/server/app.test.ts` so the `tools/list` test asserts that
the `manage_skill` action enum excludes `delete`. Extend its local schema type
only as much as needed to inspect `properties.action.enum`.

Replace the deletion success test in
`apps/skillpack/server/mcp.e2e.test.ts` with a negative regression test that calls
`manage_skill` using `action: "delete"` and proves:

1. the tool call returns an MCP error result;
2. an existing Managed Skill still resolves from the repository;
3. its Skill Version count is unchanged.

Inspect the JSON-RPC response envelope directly for this negative case. After
`delete` leaves the action enum, MCP SDK validation returns plain-text error
content, so `parseToolResult` cannot parse it as the tool's structured JSON.
Assert HTTP 200, `result.isError === true`, and input-validation text. Then query
the repository independently to prove the Managed Skill and version count remain
unchanged. Reuse the existing `mcpRequest`, Miniflare D1, and R2 setup. Do not
test REST deletion here.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/app.test.ts server/mcp.e2e.test.ts`
→ the new assertions fail against the current implementation for the expected reason: `delete` remains registered and succeeds.

### Step 2: Remove deletion from `manage_skill`

In `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`:

1. Remove `delete` from the action enum and action description.
2. Remove `delete` from the tool-level action list.
3. Delete `handleDelete` in full.
4. Remove the `case "delete"` switch branch.
5. Change the `remove_file` reserved `SKILL.md` message so it says the main file cannot be removed with `remove_file`; do not direct the caller to another MCP deletion action.
6. Keep `destructiveHint: true` because `edit`, `patch`, and `remove_file` still mutate or remove content.
7. Keep the recoverable-version statement, which becomes truthful once whole-Skill deletion is absent.

Do not touch `SkillService.deleteSkillByName`; REST/session management still owns
that use case.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/app.test.ts server/mcp.e2e.test.ts`
→ all selected tests pass.

### Step 3: Align user-facing MCP documentation

Update the `manage_skill` capability bullet in `README.md` and
`docs/skill-delivery-design.md`. List creation, patching, full edits, and attached
file management. Remove wording that advertises Managed Skill deletion.

Keep the unified `manage_skill` name. Do not restore legacy tool aliases.

**Verify**:
`rg -n 'manage_skill.*delete|delete.*manage_skill' README.md docs/skill-delivery-design.md`
→ no matches.

### Step 4: Run repository gates

Run the complete repository checks without using a formatter in write mode.

**Verify**:

1. `pnpm check` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm test` → all tests pass.
4. `pnpm build` → exit 0.
5. `git diff --check` → no output.
6. `git status --short` → only in-scope source/docs files and the permitted plan status update are listed.

## Test plan

Add or update tests for:

- `tools/list` action enum omits `delete`.
- A direct `manage_skill` call with `action: "delete"` is rejected.
- The rejected call leaves the Managed Skill and its Skill Version History unchanged.
- Existing create, patch, edit, write-file, and read behavior remains green.

Use `apps/skillpack/server/app.test.ts` for catalog/schema behavior and
`apps/skillpack/server/mcp.e2e.test.ts` for D1/R2 state assertions.

## Done criteria

- [ ] `manage_skill` exposes no `delete` action.
- [ ] `handleDelete` and its switch branch are absent.
- [ ] MCP docs contain no claim that `manage_skill` deletes Managed Skills.
- [ ] REST/session Skill deletion remains unchanged.
- [ ] The negative MCP deletion regression test passes and proves state retention.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `git diff --check` produces no output.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 001 `DONE`.

## STOP conditions

Stop and report back if:

- The maintainer asks to retain MCP deletion or introduces a separate delete authorization decision; that requires a new ADR-level design.
- Removing the action requires changing REST deletion code or OAuth scope semantics.
- MCP SDK input validation still dispatches `handleDelete` after the action is removed from the schema.
- An in-scope file has semantic drift from the excerpts above.
- A verification command fails twice after a reasonable focused fix.

## Maintenance notes

Future MCP deletion work requires an explicit decision covering authorization,
confirmation, recovery semantics, and whether deletion removes Version History.
Reviewers should confirm that no tool description or error message still teaches
agents to delete a whole Managed Skill. The direct cutover from legacy tool names
is an accepted maintainer decision recorded in `plans/README.md`.
