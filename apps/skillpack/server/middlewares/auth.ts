import { createAuth, skillpackOAuthScopes } from "@server/auth";
import type { AuthSession } from "@server/auth";
import { apiError } from "@server/lib/http";
import { SkillRepository } from "@server/modules/skills/repository";
import { ResourceManifest } from "@server/modules/skills/resource-manifest";
import { SkillService } from "@server/modules/skills/service";
import {
  getMcpOAuthResource,
  getMcpSkillReadBearerUserId,
  getOAuthResource,
  getSkillReadBearerUserId,
  getRequestOrigin,
} from "@server/oauth";
import type { AppBindings } from "@server/types";
import type { Context, MiddlewareHandler } from "hono";
import { some } from "hono/combine";
import { createMiddleware } from "hono/factory";

class UnauthorizedAuthError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedAuthError";
  }
}

type SetSkillServicesForUser = (
  c: Context<AppBindings>,
  userId: string
) => void;

export interface AuthMiddlewareOptions {
  getSkillReadBearerUserId?: typeof getSkillReadBearerUserId;
  setSkillServicesForUser?: SetSkillServicesForUser;
}

const setDefaultSkillServicesForUser = (
  c: Context<AppBindings>,
  userId: string
) => {
  c.set("currentUser", { id: userId });
  const skillRepository = new SkillRepository(c.var.db, userId);
  const resourceManifest = new ResourceManifest(c.var.skillStorage);

  c.set("skillRepository", skillRepository);
  c.set(
    "skillService",
    new SkillService(skillRepository, resourceManifest, c.var.originService)
  );
};

const authorizeSession = async (
  c: Context<AppBindings>,
  setSkillServicesForUser: SetSkillServicesForUser
) => {
  const origin = getRequestOrigin(c.req.url);
  let session: AuthSession | null;

  try {
    session = await createAuth(c.env, origin).api.getSession({
      asResponse: false,
      headers: c.req.raw.headers,
    });
  } catch {
    throw new UnauthorizedAuthError();
  }

  if (!session) {
    throw new UnauthorizedAuthError();
  }

  setSkillServicesForUser(c, session.user.id);
};

const catchUnauthorized = (
  middleware: MiddlewareHandler<AppBindings>
): MiddlewareHandler<AppBindings> =>
  createMiddleware<AppBindings>(async (c, next) => {
    try {
      return await middleware(c, next);
    } catch (error) {
      if (error instanceof UnauthorizedAuthError) {
        return c.json(apiError("Unauthorized"), 401);
      }

      throw error;
    }
  });

const createRequireSessionAuthCandidate = (
  setSkillServicesForUser: SetSkillServicesForUser = setDefaultSkillServicesForUser
): MiddlewareHandler<AppBindings> =>
  createMiddleware<AppBindings>(async (c, next) => {
    await authorizeSession(c, setSkillServicesForUser);
    await next();
  });

export const createRequireSessionAuth = (
  setSkillServicesForUser?: SetSkillServicesForUser
): MiddlewareHandler<AppBindings> =>
  catchUnauthorized(createRequireSessionAuthCandidate(setSkillServicesForUser));

const createRequireSkillReadBearerAuth = (
  options: AuthMiddlewareOptions
): MiddlewareHandler<AppBindings> => {
  const setSkillServicesForUser =
    options.setSkillServicesForUser ?? setDefaultSkillServicesForUser;
  const verifyBearerUserId =
    options.getSkillReadBearerUserId ?? getSkillReadBearerUserId;

  return createMiddleware<AppBindings>(async (c, next) => {
    if (!c.req.header("authorization")?.startsWith("Bearer ")) {
      throw new UnauthorizedAuthError();
    }

    const origin = getRequestOrigin(c.req.url);
    let userId: string | undefined;

    try {
      userId = await verifyBearerUserId(c.env, origin, c.req.raw.headers);
    } catch {
      throw new UnauthorizedAuthError();
    }

    if (!userId) {
      throw new UnauthorizedAuthError();
    }

    setSkillServicesForUser(c, userId);
    await next();
  });
};

export const createRequireSkillsAuth = (
  options: AuthMiddlewareOptions
): MiddlewareHandler<AppBindings> => {
  const requireSessionAuth = createRequireSessionAuth();
  const requireSessionAuthCandidate = createRequireSessionAuthCandidate();
  const requireSkillReadAuth = catchUnauthorized(
    some(requireSessionAuthCandidate, createRequireSkillReadBearerAuth(options))
  );

  return createMiddleware<AppBindings>(async (c, next) => {
    if (c.req.method === "GET") {
      return await requireSkillReadAuth(c, next);
    }

    return await requireSessionAuth(c, next);
  });
};

export const createRequireMcpAuth = (
  options: AuthMiddlewareOptions
): MiddlewareHandler<AppBindings> => {
  const verifyBearerUserId =
    options.getSkillReadBearerUserId ?? getMcpSkillReadBearerUserId;
  const setSkillServicesForUser =
    options.setSkillServicesForUser ?? setDefaultSkillServicesForUser;

  return createMiddleware<AppBindings>(async (c, next) => {
    const requestOrigin = getRequestOrigin(c.req.url);
    const resource = getOAuthResource(c.env, requestOrigin);
    const mcpResource = getMcpOAuthResource(c.env, requestOrigin);
    const challenge = `Bearer realm="mcp", resource_metadata="${resource}/.well-known/oauth-protected-resource/mcp", scope="${skillpackOAuthScopes.join(" ")}"`;
    const origin = c.req.header("origin");

    if (
      origin &&
      origin !== requestOrigin &&
      origin !== resource &&
      origin !== mcpResource
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (!c.req.header("authorization")?.startsWith("Bearer ")) {
      c.header("WWW-Authenticate", challenge);
      return c.json({ error: "Unauthorized" }, 401);
    }

    let userId: string | undefined;

    try {
      userId = await verifyBearerUserId(
        c.env,
        requestOrigin,
        c.req.raw.headers
      );
    } catch {
      c.header("WWW-Authenticate", challenge);
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!userId) {
      c.header("WWW-Authenticate", challenge);
      return c.json({ error: "Unauthorized" }, 401);
    }

    setSkillServicesForUser(c, userId);
    await next();
  });
};
