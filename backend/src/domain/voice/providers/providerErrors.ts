export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly requestId: string | null,
    public readonly isRetryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class SarvamSttError extends ProviderError {
  constructor(message: string, code: string, requestId: string | null, isRetryable: boolean) {
    super(message, code, requestId, isRetryable);
    this.name = "SarvamSttError";
  }
}

export class SarvamLlmError extends ProviderError {
  constructor(message: string, code: string, requestId: string | null, isRetryable: boolean) {
    super(message, code, requestId, isRetryable);
    this.name = "SarvamLlmError";
  }
}

/**
 * Classify an HTTP status code as retryable.
 * Retryable: 429, 500, 503, and network-level timeouts (no status).
 * Non-retryable: 400, 401, 403, 404, 422, etc.
 */
export function isRetryableHttpStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network error / timeout
  return status === 429 || status === 500 || status === 503;
}

/**
 * Build a route-safe error message that never includes raw provider payloads.
 */
export function buildRouteSafeErrorMessage(error: ProviderError): string {
  return `[${error.name}] ${error.message}${error.requestId ? ` (request: ${error.requestId})` : ""}`;
}
