# Plan 002: Preserve custom frontmatter in full SKILL.md mutations

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat f999925..HEAD -- apps/skillpack/server/modules/mcp/tools/manage-skill.ts apps/skillpack/server/modules/skills/types.ts apps/skillpack/server/modules/skills/service.ts apps/skillpack/server/modules/skills/service.test.ts apps/skillpack/server/mcp.e2e.test.ts`
> Plan 001 is a declared dependency. Confirm it is marked `DONE`, then run:
> `rg -n 'handleDelete|case "delete"' apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
> (expected: no matches) and
> `rg -n 'manage_skill.*delete|delete.*manage_skill' README.md docs/skill-delivery-design.md`
> (expected: no matches). The only allowed predecessor changes in this plan's
> in-scope files are removal of the `delete` enum value, description text,
> handler/switch branch, and the former deletion E2E case. Stop on any other
> semantic mismatch.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-remove-mcp-delete-action.md`
- **Category**: bug
- **Planned at**: commit `f999925`, 2026-07-10

## Why this matters

`manage_skill` accepts a complete `SKILL.md`, yet its create/edit conversion only
forwards known projection fields. Unknown frontmatter is silently dropped during
create and silently ignored during edit or text patch. This loses agent
compatibility metadata while reporting a successful mutation. The storage model
already supports arbitrary frontmatter JSON, so the fix belongs in the MCP to
SkillService handoff and canonical serialization path.

## Current state

Relevant files:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts` — parses submitted full Skill files and converts them to service inputs.
- `apps/skillpack/server/modules/skills/types.ts` — aliases service mutation inputs directly to public REST contracts.
- `apps/skillpack/server/modules/skills/service.ts` — serializes canonical `SKILL.md` and stores the parsed frontmatter snapshot.
- `apps/skillpack/server/modules/skills/service.test.ts` — existing unit patterns for canonical Skill file creation and patching.
- `apps/skillpack/server/mcp.e2e.test.ts` — D1/R2 integration coverage for the MCP authoring flow.

The parser already returns all frontmatter:

```ts
// apps/skillpack/server/shared/skill-file.ts:105-120
return {
  allowedTools: parseOptionalString(...),
  body: content,
  compatibility: parseOptionalString(...),
  description,
  frontmatter: data,
  license: parseOptionalString(data.license, skillLicenseSchema),
  metadata: parseMetadata(data.metadata),
  name,
};
```

The MCP conversion drops `parsed.frontmatter`:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:140-152
const { parsed } = validation;

return {
  allowedTools: parsed.allowedTools,
  compatibility: parsed.compatibility,
  content: parsed.body,
  deleteResourcePaths: [],
  description: parsed.description,
  license: parsed.license,
  metadata: parsed.metadata,
  name: parsed.name,
  upsertResources: [],
};
```

Create has the same loss:

```ts
// apps/skillpack/server/modules/mcp/tools/manage-skill.ts:180-189
const result = await context.skillService.createSkill({
  allowedTools: validation.parsed.allowedTools,
  compatibility: validation.parsed.compatibility,
  content: validation.parsed.body,
  description: validation.parsed.description,
  license: validation.parsed.license,
  metadata: validation.parsed.metadata,
  name: validation.parsed.name,
  resources: [],
});
```

Service inputs currently cannot carry raw frontmatter:

```ts
// apps/skillpack/server/modules/skills/types.ts:118-120
export type CreateSkillServiceInput = CreateSkillInput;
export type ForkSkillServiceInput = ForkSkillInput;
export type PatchSkillServiceInput = PatchSkillInput;
```

Create serializes without a base frontmatter object, and patch serializes against
the current stored frontmatter:

```ts
// apps/skillpack/server/modules/skills/service.ts:249-252
const skillFileContent = serializeSkillFile(input, input.content);
const parsedSkillFile = parseSkillFile(skillFileContent);
```

```ts
// apps/skillpack/server/modules/skills/service.ts:353-364
const currentSkillFile = await this.readSkillFileForRow(skill);
const skillFileContent = serializeSkillFile(
  metadata,
  input.content ?? currentSkillFile.body,
  currentSkillFile.frontmatter
);
```

ADR-0009 defines the storage contract:

```ts
// docs/decisions/0009-inline-skill-version-snapshots.md:55-65
// SkillVersionFrontmatter is open to arbitrary compatibility fields.
type SkillVersionFrontmatter = {
  "allowed-tools"?: string;
  compatibility?: string;
  license?: string;
  metadata?: Record<string, string>;
} & Record<string, unknown>;
```

Canonical rule: structured `name`, `description`, and known projection fields
remain authoritative. `serializeSkillFile` already enforces that by stripping
known keys from the base frontmatter and writing canonical values back. Preserve
unknown fields through the `baseFrontmatter` argument rather than storing the raw
submitted bytes unchanged.

## Commands you will need

| Purpose       | Command                                                                              | Expected on success      |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| Install       | `pnpm install --frozen-lockfile`                                                     | exit 0                   |
| Service tests | `pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts` | all selected tests pass  |
| MCP E2E       | `pnpm --filter @skillpack/app exec vitest run server/mcp.e2e.test.ts`                | all selected tests pass  |
| Check         | `pnpm check`                                                                         | exit 0, no findings      |
| Typecheck     | `pnpm typecheck`                                                                     | exit 0, no errors        |
| Full tests    | `pnpm test`                                                                          | all workspace tests pass |
| Build         | `pnpm build`                                                                         | exit 0                   |

## Suggested executor toolkit

- Read `.agents/skills/hono/SKILL.md` before changing MCP integration tests.
- Consult `docs/decisions/0009-inline-skill-version-snapshots.md` and `docs/backend-architecture.md` before implementation.

## Scope

**In scope**:

- `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`
- `apps/skillpack/server/modules/skills/types.ts`
- `apps/skillpack/server/modules/skills/service.ts`
- `apps/skillpack/server/modules/skills/service.test.ts`
- `apps/skillpack/server/mcp.e2e.test.ts`
- `plans/README.md` (status update only)

**Out of scope**:

- `packages/contracts/src/skills/*` — REST request contracts must stay unchanged
- `apps/skillpack/server/shared/frontmatter.ts` and parser behavior
- D1 schema or migrations; `skill_versions.frontmatter` already supports arbitrary keys
- Origin Adapter/fork semantics
- Raw-byte preservation of YAML comments, key order, quoting, or whitespace; canonical serialization remains intentional
- Legacy MCP tool aliases

## Git workflow

- Suggested branch: `advisor/002-preserve-skill-frontmatter`
- Use one focused commit after verification; use an imperative message such as `Preserve custom MCP skill frontmatter`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add failing service and MCP regressions

In `apps/skillpack/server/modules/skills/service.test.ts`, extend the create and
patch coverage with explicit custom frontmatter such as:

```yaml
x-agent: pi
references:
  - references/guide.md
```

Add assertions that:

1. create passes custom fields into canonical serialization and repository Skill Version metadata;
2. full-file patch replaces a prior custom value with the submitted value;
3. removing a custom key from a submitted full Skill file removes it from the next version;
4. canonical `name`, `description`, `allowed-tools`, `compatibility`, `license`, and `metadata` still come from parsed structured fields.

In `apps/skillpack/server/mcp.e2e.test.ts`, make the create/edit flow include a
custom key, then read `skill://<name>/SKILL.md` after each relevant mutation and
assert the custom key survives create and changes after edit. Add one targeted
`patch` action that changes a custom frontmatter value and assert the returned
Skill file contains the new value.

Use unique marker values in assertions; do not snapshot the entire YAML output.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts server/mcp.e2e.test.ts`
→ the new custom-frontmatter assertions fail against the current implementation.

### Step 2: Add internal frontmatter-aware service input types

In `apps/skillpack/server/modules/skills/types.ts`, keep the public REST contract
unchanged and extend only internal service inputs:

```ts
export type CreateSkillServiceInput = CreateSkillInput & {
  frontmatter?: Record<string, unknown>;
};

export type PatchSkillServiceInput = PatchSkillInput & {
  frontmatter?: Record<string, unknown>;
};
```

Keep `ForkSkillServiceInput` unchanged.

This field means "the complete parsed frontmatter used as the base for canonical
serialization." Omission means the existing REST behavior: create has no base,
and patch preserves current custom fields.

**Verify**: `pnpm typecheck` → exit 0, no errors.

### Step 3: Preserve submitted frontmatter through canonical serialization

In `apps/skillpack/server/modules/skills/service.ts`:

1. Pass `input.frontmatter` as the third argument to `serializeSkillFile` during create.
2. In `storePatchedSkillFile`, choose the base frontmatter with presence semantics:
   - when the internal input owns a `frontmatter` key, use that submitted object;
   - when it is omitted, use `currentSkillFile.frontmatter`.
3. Use `Object.hasOwn(input, "frontmatter")`; avoid `??`, because an explicit empty parsed base must be able to remove all prior custom keys.
4. Continue parsing the serialized result and persisting `nextSkillFile.frontmatter`; this keeps D1 and the stored canonical file aligned.
5. Ensure `hasSkillFileChanges` treats an explicitly supplied frontmatter base as a Skill file change, even when body and known metadata are unchanged.

Do not store raw submitted YAML. Known structured keys must continue to override
same-named values in the base frontmatter via `serializeSkillFile`.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts`
→ all service tests pass.

### Step 4: Forward parsed frontmatter from MCP full-file actions

In `apps/skillpack/server/modules/mcp/tools/manage-skill.ts`:

1. Add `frontmatter: parsed.frontmatter` to `toSkillPatchFromContent`.
2. Add `frontmatter: validation.parsed.frontmatter` to the create service input.
3. Keep frontmatter `name` matching at the MCP boundary.
4. Keep patch/edit output formatting unchanged.

After Plan 001, `delete` should already be absent. Preserve that predecessor
state.

**Verify**:
`pnpm --filter @skillpack/app exec vitest run server/modules/skills/service.test.ts server/mcp.e2e.test.ts`
→ all selected tests pass, including create/edit/patch custom-frontmatter cases.

### Step 5: Run repository gates

**Verify**:

1. `pnpm check` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm test` → all tests pass.
4. `pnpm build` → exit 0.
5. `git diff --check` → no output.
6. `git status --short` → only in-scope files and the permitted plan status update are listed.

## Test plan

Use `service.test.ts` for canonical serialization rules and `mcp.e2e.test.ts` for
observable D1/R2 behavior. Cover:

- create with arbitrary scalar and array-valued custom frontmatter;
- edit changes a custom key;
- edit removes a custom key omitted from the submitted complete file;
- text patch changes a custom key;
- known fields remain canonical;
- REST-style service calls that omit `frontmatter` preserve current behavior.

Avoid full YAML snapshots, which are brittle to serializer formatting.

## Done criteria

- [ ] MCP create preserves arbitrary submitted frontmatter.
- [ ] MCP edit and Skill-file patch apply custom frontmatter additions, changes, and removals.
- [ ] Known structured fields remain canonical.
- [ ] REST contracts and D1 schema are unchanged.
- [ ] New service unit and MCP E2E regressions pass.
- [ ] `pnpm check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` exit 0.
- [ ] `git diff --check` produces no output.
- [ ] No files outside the in-scope list are modified.
- [ ] `plans/README.md` marks Plan 002 `DONE`.

## STOP conditions

Stop and report back if:

- Preserving custom frontmatter appears to require exposing arbitrary frontmatter through the public REST contracts.
- The D1 schema cannot persist the tested values already allowed by `SkillVersionFrontmatterJson`.
- Canonical serialization would require storing raw YAML bytes or preserving comments/formatting.
- Plan 001 is incomplete or `delete` has reappeared in `manage_skill`.
- An in-scope excerpt has unrelated semantic drift.
- A verification command fails twice after a focused fix.

## Maintenance notes

Future full-Skill-file write surfaces should accept parsed custom frontmatter as
an internal service concern and continue using `serializeSkillFile` for canonical
known fields. Reviewers should pay special attention to presence semantics:
omitted internal `frontmatter` preserves existing custom fields; an explicitly
submitted parsed object replaces the custom-field base.
