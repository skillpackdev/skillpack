# Plan 003: Publish an action-specific manage_skill input schema

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f999925..HEAD -- apps/skillpack/server/modules/mcp/tools/manage-skill.ts apps/skillpack/server/app.test.ts apps/skillpack/server/mcp.e2e.test.ts`
> Confirm Plans 001 and 002 are marked `DONE`. Then verify predecessor state:
> `rg -n 'handleDelete|case "delete"' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> must return no matches; `rg -n 'frontmatter: (parsed|validation\.parsed)\.frontmatter' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> must return the Plan 002 create and patch forwarding sites. Those are the only
> allowed predecessor semantics in this plan's files. Stop on any other drift.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: `plans/001-remove-mcp-delete-action.md`, `plans/002-preserve-skill-frontmatter.md`
- **Category**: bug
- **Planned at**: commit `f999925`, 2026-07-10

## Why this matters

The current MCP schema marks only `action` and `name` as required, even though
each action has a different required payload. Agents must infer the contract
from prose, and cross-action fields can be accepted then ignored. The installed
MCP SDK publishes only root object schemas, so this plan nests a strict
discriminated operation union under a root `operation` property. Clients then
receive action-specific required fields while handlers gain type narrowing.

## Current state

Relevant files:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts` — owns the Zod input schema, tool metadata, handlers, and action dispatch.
- `apps/skillpack/server/app.test.ts` — inspects the generated MCP JSON Schema from `tools/list`.
- `apps/skillpack/server/mcp.e2e.test.ts` — exercises valid and invalid calls against the real MCP transport.

Current flat schema:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:15-62
const manageSkillMcpSchema = z.object({
  action: z.enum([
    /* actions */
  ]),
  content: z.string().optional(),
  file_content: z.string().optional(),
  file_path: safeRelativePathSchema.optional(),
  mediaType: z.string().min(1).optional(),
  name: skillNameSchema,
  new_string: z.string().optional(),
  old_string: z.string().optional(),
  replace_all: z.boolean().default(false),
});
```

A live `tools/list` probe at commit `f999925` returned only:

```json
{
  "required": ["action", "name"],
  "oneOf": null
}
```

SDK constraint: `McpServer` calls `normalizeObjectSchema` before generating
`tools/list` output. In the installed SDK, a root `z.discriminatedUnion(...)`
fails object normalization and is advertised as an empty object even though
runtime validation still works. A probe using the installed SDK verified that
this supported shape publishes nested `anyOf` branches:

```ts
const operationSchema = z.discriminatedUnion("action", [
  createActionSchema,
  patchActionSchema,
  // remaining action schemas
]);

const manageSkillMcpSchema = z.object({ operation: operationSchema }).strict();
```

Expected catalog shape:

```json
{
  "type": "object",
  "properties": {
    "operation": { "anyOf": ["five action object schemas"] }
  },
  "required": ["operation"],
  "additionalProperties": false
}
```

Inspect these installed declarations/implementations when verifying the work;
never modify `node_modules`:

- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:150-158` — `registerTool` accepts a complete object schema.
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:75-82` — catalog generation normalizes root objects.
- `node_modules/@modelcontextprotocol/sdk/dist/esm/server/zod-compat.js:79-126` — root object normalization behavior.

After Plan 001, supported actions are `create`, `patch`, `edit`, `write_file`,
and `remove_file`. After Plan 002, create/edit/Skill-file patch handlers forward
custom frontmatter internally.

The nested argument shape is an intentional direct cutover:

```json
{
  "operation": {
    "action": "patch",
    "name": "demo-skill",
    "old_string": "old",
    "new_string": "new"
  }
}
```

The maintainer accepted direct MCP contract cutover because connections are
generally short-lived. Do not support both flat and nested forms.

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

- Read `.agents/skills/hono/SKILL.md` for the `app.request()` testing pattern.
- Consult the installed MCP SDK files listed above before editing the schema.

## Scope

**In scope**:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
- `apps/skillpack/server/app.test.ts`
- `apps/skillpack/server/mcp.e2e.test.ts`
- `plans/README.md` (status update only)

**Out of scope**:

- Skill service/repository behavior
- Public REST contracts
- MCP tool-name aliases
- Flat `manage_skill` argument compatibility
- Reintroducing `delete`
- New content encoding or binary upload support
- MCP SDK, Zod, package manifest, or lockfile changes

## Git workflow

- Suggested branch: `advisor/003-action-specific-manage-skill-schema`
- Use one focused commit such as `Publish action-specific manage_skill schema`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add failing catalog and validation regressions

In `apps/skillpack/server/app.test.ts`, update the local JSON Schema test type to
cover `required`, `additionalProperties`, and nested `properties.operation.anyOf`.
Assert:

1. root `required` is exactly `["operation"]`;
2. root `additionalProperties` is `false`;
3. `operation.anyOf` contains exactly five object branches;
4. every branch has `additionalProperties: false`;
5. each branch's `properties.action.const` and required fields match:

| Action        | Required fields                               | Optional fields            |
| ------------- | --------------------------------------------- | -------------------------- |
| `create`      | `action`, `name`, `content`                   | none                       |
| `edit`        | `action`, `name`, `content`                   | none                       |
| `patch`       | `action`, `name`, `old_string`, `new_string`  | `file_path`, `replace_all` |
| `write_file`  | `action`, `name`, `file_path`, `file_content` | `mediaType`                |
| `remove_file` | `action`, `name`, `file_path`                 | none                       |

In `app.test.ts` or `mcp.e2e.test.ts`, add calls proving:

- `patch.new_string` accepts an empty string;
- `create` without `content` is rejected before its handler mutates state;
- `write_file` with `content` in place of `file_content` is rejected;
- a field from another action is rejected;
- `delete` is rejected;
- the former flat `{ action, name, ... }` input is rejected.

MCP SDK validation errors use HTTP 200 with `result.isError: true` and plain-text
validation content. Inspect the response envelope directly; do not pass those
errors through `parseToolResult`.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/app.test.ts server/mcp.e2e.test.ts`
→ new nested catalog assertions fail against the current flat schema.

### Step 2: Implement the nested strict operation schema and narrow handlers

In `manage-skill.ts`:

1. Define one named `.strict()` Zod object per supported action.
2. Combine those objects with `z.discriminatedUnion("action", [...])` as `manageSkillOperationSchema`.
3. Wrap it in `z.object({ operation: manageSkillOperationSchema }).strict()` as `manageSkillMcpSchema`.
4. Pass the complete root object via `inputSchema: manageSkillMcpSchema`.
5. Change the callback to destructure `{ operation }` and dispatch on `operation.action`.
6. Give each handler a narrowed action input, using named `z.infer` types or `Extract<ManageSkillOperation, { action: "..." }>`; choose the simpler local form.
7. Update all tool descriptions to show the nested `operation` shape.
8. Update every MCP test call to nest existing action fields under `operation`.
9. Preserve Plan 002's parsed-frontmatter forwarding.

Field rules:

- `old_string` is `z.string().min(1)`.
- `new_string` is required `z.string()` so empty deletion replacement is valid.
- `replace_all` defaults to `false`.
- `file_content` is the sole write-file content field; remove its `content` alias.
- `mediaType` remains optional for write-file inference.
- `delete` has no schema branch.

Remove manual missing-field checks made unreachable by schema validation. Keep
business validation and structured errors for invalid full Skill files, name
mismatch, reserved paths, missing/ambiguous patch targets, authorization, and
Skill module errors.

**Verify**:

1. `pnpm typecheck` → exit 0.
2. `pnpm --filter @skillpack/app exec vitest run server/app.test.ts server/mcp.e2e.test.ts` → all selected tests pass.
3. The `tools/list` assertion proves five nested branches with exact required fields.

### Step 3: Run repository gates

**Verify**:

1. `pnpm check` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm test` → all tests pass.
4. `pnpm build` → exit 0.
5. `rg -n 'inputSchema: manageSkillMcpSchema\.shape' apps/skillpack/server/modules/mcp/tools/manage-skill.ts` → no matches.
6. `git diff --check` → no output.
7. `git status --short` → only in-scope files and the permitted plan status update are listed.

## Test plan

Cover both the generated agent-facing contract and runtime validation:

- root object requires only `operation`;
- nested operation publishes exactly five strict action branches;
- each action publishes its real required fields;
- empty `new_string` remains valid;
- missing and cross-action fields fail before mutation;
- flat input and `delete` fail validation;
- every valid create/edit/patch/write/remove E2E call uses the nested shape;
- Plan 001 deletion and Plan 002 frontmatter regressions remain green.

Use structural assertions around `operation.anyOf`; avoid a whole-schema snapshot.

## Done criteria

- [ ] `tools/list` publishes `operation.anyOf` with five strict action branches.
- [ ] Each branch advertises its exact required fields and action literal.
- [ ] Runtime rejects flat, missing, cross-action, and delete inputs before mutation.
- [ ] `file_content` is the sole write-file content input.
- [ ] All handlers receive narrowed operation types.
- [ ] Manual missing-field branches made unreachable by Zod are removed.
- [ ] Plan 001 and Plan 002 regressions remain green.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 003 `DONE`.

## STOP conditions

Stop and report back if:

- Plans 001 or 002 are incomplete.
- `tools/list` does not publish five nested action branches with the installed MCP SDK.
- Runtime validation accepts flat or cross-action fields after the change.
- The nested schema requires Skill service, REST contract, or dependency changes.
- A valid empty `new_string` cannot be represented with the strict branch.
- A verification command fails twice after a focused fix.

## Maintenance notes

Every future `manage_skill` action must add a strict operation branch, narrowed
handler type, catalog assertion, and E2E happy path. Re-run the real `tools/list`
assertion whenever Zod or MCP SDK changes because the SDK currently requires an
object at the schema root for catalog publication.
