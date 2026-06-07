# Skillpack

A single Cloudflare Worker serving both:

- Hono API under `/api/*`
- Vite React SPA through Cloudflare static assets

The stack uses Cloudflare Workers, D1, R2, Drizzle ORM, Hono, React, Vite, Tailwind CSS, shadcn-style UI components, TypeScript, Turborepo, pnpm, and Zod schemas.

## Project layout

```text
apps/skillpack/              # Cloudflare Worker + Vite React SPA deployment unit
  client/                    # Vite React SPA
  server/                    # Hono app, Worker entrypoint, D1 schema
  migrations/                # D1 migrations
packages/core/               # shared Skillpack primitives and Zod value schemas
packages/contracts/          # frontend/backend API request/response contracts
packages/typescript-config/  # shared TypeScript configs
```

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/skillpackdev/skillpack/tree/main/apps/skillpack)

The Deploy to Cloudflare flow reads `apps/skillpack/wrangler.jsonc`, provisions
D1 and R2 bindings, prompts for required secrets, and connects the created
repository to Workers Builds for automatic deployments.

## Auth Setup

Skillpack uses Better Auth. GitHub is the primary sign-in provider, and the
same GitHub OAuth App credentials are reused for authenticated public GitHub
Origin reads. A generic OIDC provider can be enabled as an optional fallback;
when OIDC vars are absent, the OIDC login button is hidden.

For local development:

```bash
cp apps/skillpack/.dev.vars.example apps/skillpack/.dev.vars
```

Set `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` in
`.dev.vars`. Register this redirect URI with your GitHub OAuth App:

```text
http://localhost:5173/api/auth/callback/github
```

Optionally set `OIDC_CLIENT_ID` and `OIDC_DISCOVERY_URL` to enable fallback
OIDC login. Register this redirect URI with your OIDC provider:

```text
http://localhost:5173/api/auth/oauth2/callback/oidc
```

Use a GitHub OAuth App for `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`, not a
personal access token. Those same values also raise GitHub API rate limits for
public GitHub-origin discovery and fork reads.

For now, Skillpack trusts the configured browser sign-in providers for
same-email account linking while keeping Better Auth's email-verified checks.
This is a temporary v1 shortcut; a formal account linking flow should replace
it before adding more login providers.

Skillpack also acts as an OAuth Provider for agent-facing Skill Delivery. MCP
clients and extensions should discover:

```text
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource
```

Public clients should use authorization code with PKCE, dynamic client
registration, and the `skills:read` scope. The OAuth resource/audience is the
Skillpack base URL, not a transport-specific URL such as `/mcp`.

For deployed environments, set secrets with Wrangler:

```bash
pnpm --filter @skillpack/app exec wrangler secret put BETTER_AUTH_SECRET
pnpm --filter @skillpack/app exec wrangler secret put GITHUB_CLIENT_ID
pnpm --filter @skillpack/app exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm --filter @skillpack/app exec wrangler secret put OIDC_CLIENT_ID
pnpm --filter @skillpack/app exec wrangler secret put OIDC_DISCOVERY_URL
```

`GITHUB_CLIENT_ID`, `OIDC_CLIENT_ID`, and `OIDC_DISCOVERY_URL` are not strictly
secret, but they are deployment-instance values. Keeping them in Cloudflare
rather than tracked `wrangler.jsonc` keeps the open source config reusable.

Register the deployed GitHub redirect URI with the same callback path:

```text
https://<your-domain>/api/auth/callback/github
```

If OIDC is enabled, register the deployed OIDC redirect URI too:

```text
https://<your-domain>/api/auth/oauth2/callback/oidc
```

## Cloudflare setup

`apps/skillpack/wrangler.jsonc` is committed as a reusable deployment template.
It declares the Worker entrypoint, static assets, D1 binding, R2 binding, and
required secrets. Instance-specific values such as OAuth credentials and custom
domains should be configured in Cloudflare.

For manual deployments, create resources:

```bash
pnpm --filter @skillpack/app exec wrangler d1 create skillpack
pnpm --filter @skillpack/app exec wrangler r2 bucket create skillpack-objects
```

For a manual production instance, copy the generated D1 `database_id` into your
instance's `apps/skillpack/wrangler.jsonc`.

Apply migrations:

```bash
pnpm db:migrate:local
pnpm db:migrate:remote
```

The current development migration resets Managed Skill tables to the Managed
Skill model and drops old skill rows. Auth tables are not reset.

Seed local development data while `pnpm dev` is running. The skills API is protected, so pass the `better-auth.session_token` value from a local browser login:

```bash
SKILLPACK_AUTH_COOKIE='...' pnpm db:seed:local
```

Deploy:

```bash
pnpm deploy
```

## API

```text
GET  /api/health
POST /mcp
GET  /api/v1/skills
GET  /api/v1/skills/:skillName
GET  /api/v1/skills/:skillName?version=
GET  /api/v1/skills/:skillName/versions
GET  /api/v1/skills/:skillName/resources?version=&path=
GET  /api/v1/skills/:skillName/resources/raw?version=&path=
POST /api/v1/skills
POST /api/v1/skills/fork
PATCH /api/v1/skills/:skillName
POST /api/v1/skills/:skillName/versions/:versionNumber/restore
DELETE /api/v1/skills/:skillName
```

Create a skill:

```bash
curl -X POST http://localhost:5173/api/v1/skills \
  -H 'content-type: application/json' \
  -d '{
    "name": "api-skill-demo",
    "description": "Demo API-backed skill",
    "versionLabel": "first draft",
    "content": "# Demo Skill\n\nUse this skill when validating API-backed skills.",
    "resources": [
      {
        "path": "references/demo.md",
        "mediaType": "text/markdown; charset=utf-8",
        "content": "# Demo Resource\n\nExtra context loaded on demand."
      },
      {
        "path": "scripts/demo.py",
        "mediaType": "text/x-python; charset=utf-8",
        "content": "print('hello from a skill resource')\n"
      }
    ]
  }'
```

Created Skillpack-managed skills are resolved by Skill Name in public APIs:

```text
/api/v1/skills/demo
```

## MCP Skill Delivery

Skillpack exposes a remote MCP endpoint at `/mcp` for authenticated agents.
Call it with an OAuth Bearer token that has `skills:read`.

The MCP server exposes:

- `skillpack_list` — list the authenticated user's Managed Skill catalog.
- `skillpack_read` — read a `skill://skillpack/{skillName}` location or one
  attached resource path.
- MCP resources — list and read current Skill versions plus attached resources.
- `use_skillpack_skills` — prompt guidance for agents.

Agents should use `skillpack_read` for `skill://skillpack/...` locations instead
of filesystem reads.
