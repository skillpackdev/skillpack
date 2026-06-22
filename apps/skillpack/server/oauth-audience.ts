const appendPath = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/$/u, "")}${path}`;

const getAudiences = (resource: string) => [
  ...new Set([resource, new URL(resource).href]),
];

export const getOAuthResource = (env: Env, origin: string) =>
  env.AUTH_BASE_URL ?? origin;

export const getOAuthAudiences = (env: Env, origin: string) =>
  getAudiences(getOAuthResource(env, origin));

export const getMcpOAuthResource = (env: Env, origin: string) =>
  appendPath(getOAuthResource(env, origin), "/mcp");

export const getMcpOAuthAudiences = (env: Env, origin: string) =>
  getAudiences(getMcpOAuthResource(env, origin));
