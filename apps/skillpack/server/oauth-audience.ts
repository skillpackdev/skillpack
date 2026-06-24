const normalizeResource = (url: string): string => url.replace(/\/$/u, "");

export const getOAuthResource = (env: Env, origin: string) =>
  normalizeResource(env.AUTH_BASE_URL ?? origin);

export const getMcpOAuthResource = (env: Env, origin: string) =>
  `${getOAuthResource(env, origin)}/mcp`;
