import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { hashPassword } from "better-auth/crypto";

const execFileAsync = promisify(execFile);

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const apiUrl = process.env.SKILLPACK_DEV_URL ?? "http://localhost:5173";
const authCookieName = "better-auth.session_token";
const authCookieValue = process.env.SKILLPACK_AUTH_COOKIE;
const localUser = {
  accountId: "local-dev-credential-account",
  email: "dev@skillpack.local",
  id: "local-dev-user",
  name: "Local Developer",
  password: "skillpack-dev",
};

const getAuthCookie = () => {
  if (!authCookieValue) {
    return;
  }

  if (authCookieValue.includes("=")) {
    return authCookieValue;
  }

  return `${authCookieName}=${authCookieValue}`;
};

let authCookie = getAuthCookie();

const quoteSqlValue = (value) => `'${value.replaceAll("'", "''")}'`;

const seedLocalUser = async () => {
  const now = Date.now();
  const passwordHash = await hashPassword(localUser.password);
  const email = quoteSqlValue(localUser.email);
  const userId = quoteSqlValue(localUser.id);

  const sql = `
INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
VALUES (${userId}, ${quoteSqlValue(localUser.name)}, ${email}, 1, ${now}, ${now})
ON CONFLICT("email") DO UPDATE SET
  "name" = excluded."name",
  "emailVerified" = excluded."emailVerified",
  "updatedAt" = excluded."updatedAt";

INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
SELECT ${quoteSqlValue(localUser.accountId)}, "id", 'credential', "id", ${quoteSqlValue(passwordHash)}, ${now}, ${now}
FROM "user"
WHERE "email" = ${email}
ON CONFLICT("providerId", "accountId") DO UPDATE SET
  "password" = excluded."password",
  "updatedAt" = excluded."updatedAt";
`;

  await execFileAsync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "skillpack",
      "--local",
      "--command",
      sql,
    ],
    { cwd: appDirectory }
  );

  console.log(`seeded local user ${localUser.email}`);
};

const getSessionCookie = (response) => {
  const setCookieHeaders = response.headers.getSetCookie?.() ?? [
    response.headers.get("set-cookie"),
  ];

  const sessionCookie = setCookieHeaders.find((header) =>
    header?.startsWith(`${authCookieName}=`)
  );

  return sessionCookie?.split(";", 1)[0];
};

const authenticateLocalUser = async () => {
  if (authCookie) {
    return;
  }

  const response = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    body: JSON.stringify({
      email: localUser.email,
      password: localUser.password,
    }),
    headers: {
      "content-type": "application/json",
      origin: new URL(apiUrl).origin,
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to authenticate local user: ${response.status} ${body}`
    );
  }

  authCookie = getSessionCookie(response);
  if (!authCookie) {
    throw new Error("Local user sign-in did not return a session cookie");
  }
};

const skills = [
  {
    content: `# Demo Skill

Use this skill when validating API-backed skills in local development.

## Workflow

1. Load the skill list from the API.
2. Read this skill through the API.
3. Confirm the content is served from R2-backed storage.
`,
    description:
      "Demo API-backed skill for validating the local registry flow.",
    name: "api-skill-demo",
    resources: [
      {
        content: `# Demo Resource

This reference is loaded from an R2-backed skill resource.
`,
        mediaType: "text/markdown; charset=utf-8",
        path: "references/demo.md",
      },
      {
        content: `def greet(name: str) -> str:
    return f"Hello, {name}!"
`,
        mediaType: "text/x-python; charset=utf-8",
        path: "scripts/greet.py",
      },
      {
        content: `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`,
        mediaType: "text/typescript; charset=utf-8",
        path: "scripts/greet.ts",
      },
    ],
  },
  {
    content: `# Cloudflare Worker Review

Use this skill when reviewing a Cloudflare Worker before local testing or deploy.

## Checklist

- Confirm bindings are declared in wrangler config.
- Confirm API routes use the expected prefix.
- Confirm static asset routing keeps API requests on the Worker.
- Run typecheck and build before deploy.
`,
    description:
      "Review Cloudflare Worker code for bindings, routing, and deployment readiness.",
    name: "cloudflare-worker-review",
  },
  {
    content: `# Frontend Structure Check

Use this skill when adding or moving frontend files.

## Rules

- Put route entries in pages.
- Put workflows and API hooks in features.
- Put pure business logic in domain.
- Put reusable business UI in components.
- Put generic infrastructure in shared.
`,
    description:
      "Check frontend files against the pages, features, domain, components, and shared structure.",
    name: "frontend-structure-check",
  },
  {
    content: `# Skill Authoring Guide

Use this skill when writing a new Agent Skill.

## Structure

- Describe when the skill should be used.
- Keep the operational workflow explicit.
- Link references for detailed guidance.
- Keep examples close to the decisions they support.
`,
    description:
      "Draft concise Agent Skills with clear triggers, workflows, and references.",
    name: "skill-authoring-guide",
  },
  {
    content: `# API Debugging Helper

Use this skill when a local API endpoint behaves unexpectedly.

## Steps

1. Reproduce with curl.
2. Check request method, path, and content type.
3. Validate response shape against shared schemas.
4. Inspect storage reads and writes.
`,
    description:
      "Debug local Hono API behavior from request shape to response validation.",
    name: "api-debugging-helper",
  },
];

const getHeaders = () => {
  const headers = { "content-type": "application/json" };

  if (authCookie) {
    headers.cookie = authCookie;
  }

  return headers;
};

const deleteExistingSkills = async (skill) => {
  const listResponse = await fetch(`${apiUrl}/api/v1/skills`, {
    headers: getHeaders(),
  });

  if (!listResponse.ok) {
    return;
  }

  const body = await listResponse.json();
  const matches = body.skills?.filter((item) => item.name === skill.name) ?? [];

  for (const match of matches) {
    const skillUrl = `${apiUrl}/api/v1/skills/${encodeURIComponent(match.name)}`;
    const response = await fetch(skillUrl, {
      headers: getHeaders(),
      method: "DELETE",
    });

    if (response.status !== 204 && response.status !== 404) {
      const errorBody = await response.text();
      throw new Error(
        `Failed to delete ${skill.name}: ${response.status} ${errorBody}`
      );
    }
  }
};

const createSkill = async (skill) => {
  await deleteExistingSkills(skill);

  const response = await fetch(`${apiUrl}/api/v1/skills`, {
    body: JSON.stringify(skill),
    headers: getHeaders(),
    method: "POST",
  });

  if (response.status === 201) {
    console.log(`seeded ${skill.name}`);
    return;
  }

  const body = await response.text();
  throw new Error(`Failed to seed ${skill.name}: ${response.status} ${body}`);
};

const main = async () => {
  console.log(`seeding local Skillpack API at ${apiUrl}`);
  await seedLocalUser();
  await authenticateLocalUser();

  for (const skill of skills) {
    await createSkill(skill);
  }

  console.log(`local login: ${localUser.email} / ${localUser.password}`);
  console.log("done");
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "Apply local migrations, start the dev server with `pnpm dev`, then run `pnpm db:seed:local`."
  );
  process.exitCode = 1;
}
