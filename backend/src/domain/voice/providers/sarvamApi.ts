type SarvamApiErrorDetails = {
  code: string;
  requestId: string | null;
};

const SAFE_PROVIDER_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PRIVATE_IPV4 =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function assertSafeProviderFileUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Unsafe provider file URL");
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const privateIpv6 =
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:");

  if (
    url.protocol !== "https:" ||
    Boolean(url.username || url.password) ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    PRIVATE_IPV4.test(hostname) ||
    privateIpv6
  ) {
    throw new Error("Unsafe provider file URL");
  }

  return url;
}

export function buildSarvamHeaders(
  apiKey: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  return {
    "api-subscription-key": apiKey,
    ...extraHeaders,
  };
}

export function extractSarvamApiErrorDetails(
  payload: unknown,
  fallbackCode: string,
): SarvamApiErrorDetails {
  const root = isRecord(payload) ? payload : {};
  const nestedError = isRecord(root.error) ? root.error : null;

  const messageSource = nestedError ?? root;

  const requestId = typeof messageSource.request_id === "string"
    ? messageSource.request_id
    : typeof root.request_id === "string"
      ? root.request_id
      : null;

  return {
    // Provider response bodies are untrusted. Keep only app-owned HTTP status
    // classification and a format-checked opaque request identifier.
    code: fallbackCode,
    requestId: requestId && SAFE_PROVIDER_REQUEST_ID.test(requestId) ? requestId : null,
  };
}

export async function parseSarvamApiErrorDetails(response: Response): Promise<SarvamApiErrorDetails> {
  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    // Ignore non-JSON error bodies and fall back to the HTTP status text.
  }

  return extractSarvamApiErrorDetails(
    payload,
    `http_${response.status}`,
  );
}
