---
status: accepted
date: 2026-05-29
decision-makers: Sean
consulted: Current Skillpack codebase, CONTEXT.md, ADR-0001, ADR-0004, MCP authorization guidance, @hono/mcp documentation
informed: Future Skillpack maintainers and coding agents
---

# ADR-0007: Expose Skillpack Skill Delivery over MCP

Skillpack will expose an authenticated MCP server at `/mcp` so agents can list
and read a user's Managed Skills through a standard MCP transport.

## Context

ADR-0001 defines MCP as one Skill Delivery interface, not Skillpack's product
identity. ADR-0004 already makes Skillpack an OAuth Provider for read-only
Managed Skill access with the `skills:read` scope.

Skillpack already supports OAuth Bearer reads over REST and the Pi extension
already exposes a `skillpack_read` tool locally. That extension-specific path is
useful, but generic MCP clients need a first-party remote MCP endpoint with the
same Skill Location semantics.

## Decision

Add `/mcp` to the single Skillpack Worker and implement it with `@hono/mcp`
`StreamableHTTPTransport`.

For v1:

- `/mcp` accepts OAuth Bearer tokens with `skills:read`.
- `/mcp` does not accept browser session cookies.
- the OAuth resource/audience remains the Skillpack `baseURL`, not `/mcp`.
- the endpoint is stateless and uses JSON responses; no SSE session state,
  event store, or Durable Object is introduced.
- unexpected browser `Origin` headers are rejected.
- the MCP server exposes:
  - `list_skills`;
  - `read_skill`;
  - `create_skill` and `update_skill` for tokens with `skills:write`;
  - SEP-2640 MCP resources for `skill://index.json`, current `SKILL.md` files, and attached resources.

The Worker static asset configuration must run the Worker first for `/mcp` so
the SPA fallback cannot intercept MCP requests.

## Consequences

- Skillpack has a first-party MCP Skill Delivery surface while preserving the
  existing REST API and Pi extension path.
- MCP clients use the same OAuth discovery and dynamic client registration flow
  already documented for Skillpack access.
- Skill Sets and delivery policy remain deferred; v1 exposes the authenticated
  user's whole Skill Library.
- The current Skill-centric model removes stable version pins from Skill
  Delivery; MCP reads resolve current Managed Skill state by Skill Name.
- Stateful MCP features require a later decision because Worker-global memory is
  not durable request state.

## Alternatives Considered

### Reuse only the Pi extension

Rejected. The extension is useful for Pi, but it does not help generic MCP
clients discover and read Skillpack skills.

### Bind OAuth audience to `/mcp`

Rejected. ADR-0004 already chose the Skillpack `baseURL` because the protected
resource is the user's Managed Skill Library, not one transport endpoint.

### Add stateful SSE MCP now

Rejected. The v1 surface is read-only request/response. Stateful streams would
need a real state boundary, such as Durable Objects, before they are reliable in
Workers.

## Implementation Plan

- Add `@hono/mcp`, direct `@modelcontextprotocol/sdk`, and required peer
  dependencies to `apps/skillpack`.
- Register `/mcp` in `server/app.ts` behind Bearer-only `skills:read` auth.
- Add a `server/modules/mcp` module for MCP protocol construction and response
  formatting.
- Reuse request-scoped `SkillService`; do not add direct D1 or R2 access in the
  MCP module.
- Add `/mcp` to `wrangler.jsonc` `assets.run_worker_first`.
- Document the endpoint in README and Skill Delivery docs.

## Verification

- [x] `/mcp` returns an OAuth Bearer challenge without auth.
- [x] valid `skills:read` Bearer tokens can initialize MCP.
- [x] unexpected browser origins are rejected before token verification.
- [x] `tools/list`, `tools/call`, `resources/list`, and `resources/read` are
      covered by tests.
- [x] existing REST skill read/write auth behavior remains covered.
