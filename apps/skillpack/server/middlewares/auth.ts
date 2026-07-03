import { createAuth, skillpackOAuthScopes } from "@server/auth";
import type { AuthSession } from "@server/auth";
import { apiError } from "@server/lib/http";
import { isSkillpackApiKeySecret } from "@server/modules/api-keys/service";
import { SkillRepository } from "@server/modules/skills/repository";
import { ResourceManifest } from "@server/modules/skills/resource-manifest";
import { SkillService } from "@server/modules/skills/service";
import {
  getOAuthResource,
  getRequestOrigin,
  getSkillBearerAccess,
  getSkillReadBearerUserId,
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

type VerifyApiKeyUserId = (secret: string) => Promise<string | undefined>;

export interface AuthMiddlewareOptions {
  getApiKeyUserId?: VerifyApiKeyUserId;
  getSkillReadBearerUserId?: typeof getSkillReadBearerUserId;
  setSkillServicesForUser?: SetSkillServicesForUser;
}

const getBearerToken = (c: Context<AppBindings>) => {
  const authorization = c.req.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return;
  }

  return authorization.slice("Bearer ".length).trim();
};

const setDefaultSkillServicesForUser = (
  c: Context<AppBindings>,
  userId: string
) => {
  c.set("currentUser", { canWrite: true, id: userId });
  c.set(
    "skillService",
    new SkillService(
      new SkillRepository(c.var.db, userId),
      new ResourceManifest(c.var.skillStorage),
      c.var.originService
    )
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

const isSkillDeliveryReadRequest = (c: Context<AppBindings>) => {
  if (c.req.method !== "GET") {
    return false;
  }

  const { pathname } = new URL(c.req.url);
  const skillsPrefix = "/api/v1/skills";
  const segments = pathname
    .slice(skillsPrefix.length)
    .split("/")
    .filter(Boolean);

  return !segments.includes("versions");
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
    if (isSkillDeliveryReadRequest(c)) {
      return await requireSkillReadAuth(c, next);
    }

    return await requireSessionAuth(c, next);
  });
};

interface McpBearerAccess {
  canWrite: boolean;
  userId: string;
}

export const createRequireMcpAuth = (
  options: AuthMiddlewareOptions
): MiddlewareHandler<AppBindings> => {
  const setSkillServicesForUser =
    options.setSkillServicesForUser ?? setDefaultSkillServicesForUser;

  const verifyApiKeyAccess = async (
    c: Context<AppBindings>,
    token: string
  ): Promise<McpBearerAccess | undefined> => {
    const userId = options.getApiKeyUserId
      ? await options.getApiKeyUserId(token)
      : await c.var.apiKeyService.verifyApiKeySecret(token);

    return userId ? { canWrite: true, userId } : undefined;
  };

  const verifyOAuthAccess = async (
    c: Context<AppBindings>,
    requestOrigin: string
  ): Promise<McpBearerAccess | undefined> => {
    try {
      if (options.getSkillReadBearerUserId) {
        const userId = await options.getSkillReadBearerUserId(
          c.env,
          requestOrigin,
          c.req.raw.headers
        );
        return userId ? { canWrite: false, userId } : undefined;
      }

      return await getSkillBearerAccess(
        c.env,
        requestOrigin,
        c.req.raw.headers
      );
    } catch {
      return undefined;
    }
  };

  return createMiddleware<AppBindings>(async (c, next) => {
    const requestOrigin = getRequestOrigin(c.req.url);
    const resource = getOAuthResource(c.env, requestOrigin);
    const challenge = `Bearer realm="mcp", resource_metadata="${resource}/.well-known/oauth-protected-resource/mcp", scope="${skillpackOAuthScopes.join(" ")}"`;
    const unauthorized = () => {
      c.header("WWW-Authenticate", challenge);
      return c.json({ error: "Unauthorized" }, 401);
    };
    const origin = c.req.header("origin");

    if (origin && origin !== requestOrigin && origin !== resource) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const token = getBearerToken(c);

    if (!token) {
      return unauthorized();
    }

    const access = isSkillpackApiKeySecret(token)
      ? await verifyApiKeyAccess(c, token)
      : await verifyOAuthAccess(c, requestOrigin);

    if (!access) {
      return unauthorized();
    }

    setSkillServicesForUser(c, access.userId);
    c.set("currentUser", { canWrite: access.canWrite, id: access.userId });
    await next();
  });
};
