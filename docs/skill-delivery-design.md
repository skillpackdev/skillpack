# Skill Delivery Design

Skill Delivery exposes Skillpack-managed Agent Skills to agent runtimes without mapping remote skills onto the local filesystem. Pi's current `resources_discover` path is still local-skill oriented, so the Pi extension uses a prompt catalog plus explicit read tools. Generic MCP clients can use Skillpack's first-party `/mcp` endpoint.

## Decision

Skillpack Managed Skills are advertised to Pi through a system prompt catalog injected by the Pi extension at `before_agent_start`.

Each catalog entry contains:

- Skill name
- Description
- `skill://skillpack/{skillName}` locator

When the agent needs skill instructions, it calls `skillpack_read` with the `skill://` locator and no `path`. The tool resolves the current Managed Skill state at read time. Attached resources are read with the same tool by passing a resource `path`.

Delivery surfaces may return structured Skill state or render a full `SKILL.md` compatibility payload when a consumer expects the file-based Agent Skills format. Skillpack's structured D1 metadata remains canonical over stored `SKILL.md` frontmatter.

This keeps `skill://` locations out of normal filesystem reads and avoids pretending remote Skillpack resources are local paths.

## Pi Extension

The extension lives at `packages/pi-extension` as `@skillpack/pi-extension`.

Responsibilities:

- Register Skillpack as Pi OAuth provider `skillpack`.
- Read credentials from Pi auth storage through normal `/login skillpack` flow.
- Call Skillpack APIs with `Authorization: Bearer <access-token>`.
- Inject the authenticated user's Skill Library catalog into the system prompt.
- Register `skillpack_read` for reading the current Skill state and attached resources.
- Register `/skillpack` for listing, selecting, and activating Skillpack skills.

The `/skillpack` command accepts a Skill Name or `skill://skillpack/{skillName}` location. With no arguments, it opens a selector. Selecting a skill pre-fills `/skillpack:{name} ` in the editor so the user can add task prompt text before sending.

## Locator

Current Skill state:

```text
skill://skillpack/{skillName}
```

Delivery identity is Skill Name in an authorized user context. GitHub URLs, source-qualified paths, internal Skill IDs, and stable version pins are not delivery identity.

## API Reuse

The Pi extension uses the existing authenticated Skillpack API:

```text
GET /api/v1/skills
GET /api/v1/skills/:skillName
GET /api/v1/skills/:skillName/resources?path=:path
GET /api/v1/skills/:skillName/resources/raw?path=:path
```

Snapshot APIs are management APIs. Skill Delivery reads current Managed Skill state.

## MCP Endpoint

Skillpack exposes a remote MCP server at:

```text
POST /mcp
```

The endpoint uses OAuth Bearer tokens with `skills:read`. The protected resource remains the Skillpack base URL rather than `/mcp`.

MCP capabilities:

- `skillpack_list` lists the authenticated user's Managed Skill catalog.
- `skillpack_read` reads `skill://skillpack/{skillName}` locations and attached resource paths.
- MCP resources expose current Skills and attached resources for clients that prefer resource discovery.

The endpoint is stateless in v1 and uses request/response JSON over `@hono/mcp` Streamable HTTP transport.

## Auth

The extension registers a standard OAuth PKCE provider under Pi provider id `skillpack`.

OAuth behavior:

- Prompt the user for the Skillpack base URL during `/login skillpack`.
- Discover authorization server metadata from `/.well-known/oauth-authorization-server`, falling back to `/.well-known/openid-configuration`.
- Discover protected resource metadata from `/.well-known/oauth-protected-resource`.
- Dynamically register a public OAuth client with the local callback redirect URI.
- Use authorization-code + PKCE with the `skills:read` scope and Skillpack resource audience.
- Store access token, refresh token, client ID, resource, and base URL in Pi auth storage.
- Refresh tokens through the discovered token endpoint with the same resource audience.

There is no dev bypass in the extension.

## Intentional Non-Goals

- Do not use Pi `resources_discover` for Skillpack remote skills in v1.
- Do not register remote skills as local `/skill:name` filesystem skills.
- Do not introduce Skill Sets for v1 catalog scope.
- Do not add stable version pins to Skill Delivery.
- Do not add stateful MCP SSE sessions until Skillpack introduces a durable state boundary for them.
