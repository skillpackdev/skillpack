/**
 * Resolves a PATCH-style field where an omitted key means "keep current"
 * while an explicit value (including null) means "set to this value".
 */
export const patchedValue = <T>(
  input: Record<string, unknown>,
  key: string,
  current: T
): T => (Object.hasOwn(input, key) ? (input[key] as T) : current);
