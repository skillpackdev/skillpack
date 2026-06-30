export type ApiKeyErrorCode =
  | "api-key-not-found"
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
  apiKeyNotFound: () =>
    new ApiKeyModuleError("api-key-not-found", "API key not found"),
  invalidApiKeyExpiration: () =>
    new ApiKeyModuleError(
      "invalid-api-key-expiration",
      "API key expiration must be within one year"
    ),
} as const;
