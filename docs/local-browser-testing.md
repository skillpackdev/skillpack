# Local Browser Testing

Use `agent-browser` or `playwright-cli` to smoke-test the local Skillpack UI.
This guide only covers Skillpack-specific setup and expected behavior; use
`agent-browser skills get core` or `playwright-cli --help` for tool usage.

## Start And Seed Skillpack

For a new checkout, create `apps/skillpack/.dev.vars` from the example and set
at least `BETTER_AUTH_SECRET`. GitHub and OIDC settings are optional for local
email/password testing.

```bash
pnpm install
cp apps/skillpack/.dev.vars.example apps/skillpack/.dev.vars
pnpm db:migrate:local
```

Start the app in one terminal:

```bash
pnpm dev
```

With the dev server running, seed the local account and example skills from a
second terminal:

```bash
pnpm db:seed:local
```

The seed command prints the local login. The email is
`dev@skillpack.local`; use the password printed after `local login:`.

## Run The Smoke Test

Use whichever CLI is installed, preferably in an isolated session:

```bash
agent-browser --session skillpack-local open http://localhost:5173/login
# or
playwright-cli -s=skillpack-local open http://localhost:5173/login
```

Verify these behaviors:

1. `/login` shows Email, Password, and **Sign in** controls.
2. An incorrect password stays on `/login`, shows
   `Invalid email or password`, and returns `401` from
   `POST /api/auth/sign-in/email`.
3. The seeded credentials return `200`, redirect to `/skills`, and show the
   seeded Library for **Local Developer**.

GitHub and OIDC buttons depend on local provider configuration and are not
required for this smoke test.

If the seed reports missing tables, run `pnpm db:migrate:local` before seeding
again. Browser testing complements, rather than replaces, `pnpm test`,
`pnpm typecheck`, and `pnpm check`.
