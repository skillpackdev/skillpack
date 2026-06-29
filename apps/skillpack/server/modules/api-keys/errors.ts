export type ApiKeyErrorCode =
  | "api-key-expired"
  | "api-key-not-found"
  | "api-key-revoked"
  | "invalid-api-key-expiration";

export class ApiKeyModuleError extends Error {
  readonly code: ApiKeyErrorCode;

  constructor(code: ApiKeyErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ApiKeyModuleError";
  }
}

export const apiKeyErrors = {
  apiKeyExpired: () =>
    new ApiKeyModuleError("api-key-expired", "API key expired"),
  apiKeyNotFound: () =>
    new ApiKeyModuleError("api-key-not-found", "API key not found"),
  apiKeyRevoked: () =>
    new ApiKeyModuleError("api-key-revoked", "API key revoked"),
  invalidApiKeyExpiration: () =>
    new ApiKeyModuleError(
      "invalid-api-key-expiration",
      "API key expiration must be in the future"
    ),
} as const;
