export const getOAuthResource = (env: Env, origin: string) =>
  env.AUTH_BASE_URL ?? origin;

export const getOAuthAudiences = (env: Env, origin: string) => {
  const resource = getOAuthResource(env, origin);
  const normalizedResource = new URL(resource).href;

  return [...new Set([resource, normalizedResource])];
};
