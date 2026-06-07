const apiUrl = process.env.SKILLPACK_DEV_URL ?? "http://localhost:5173";
const authCookieName = "better-auth.session_token";
const authCookieValue = process.env.SKILLPACK_AUTH_COOKIE;

const getAuthCookie = () => {
  if (!authCookieValue) {
    return;
  }

  if (authCookieValue.includes("=")) {
    return authCookieValue;
  }

  return `${authCookieName}=${authCookieValue}`;
};

const authCookie = getAuthCookie();

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
    const response = await fetch(`${apiUrl}/api/v1/skills/${match.id}`, {
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

  for (const skill of skills) {
    await createSkill(skill);
  }

  console.log("done");
};

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "Start the local dev server with `pnpm dev`, then run `pnpm db:seed:local`. Set SKILLPACK_AUTH_COOKIE for protected local APIs."
  );
  process.exitCode = 1;
}
