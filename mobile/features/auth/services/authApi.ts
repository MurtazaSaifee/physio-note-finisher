import { requestJson } from "../../runtime/requestJson";
import type {
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  RefreshRequest,
  RefreshResponse,
} from "../../../../shared/contracts/auth";

type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type RequestTransport = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  },
) => Promise<JsonResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid auth response field: ${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid auth response field: ${field}`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid auth response field: ${field}`);
  }
  return value;
}

function normalizeLoginResponse(payload: unknown): LoginResponse {
  if (!isRecord(payload) || !isRecord(payload.user) || !isRecord(payload.claims)) {
    throw new Error("Invalid login response payload");
  }

  const { user, claims } = payload;
  return {
    accessToken: requireString(payload.accessToken, "accessToken"),
    refreshToken: requireString(payload.refreshToken, "refreshToken"),
    tokenType: "Bearer",
    expiresInSeconds: requireNumber(payload.expiresInSeconds, "expiresInSeconds"),
    user: {
      id: requireString(user.id, "user.id"),
      clinicId: requireString(user.clinicId, "user.clinicId"),
      name: requireString(user.name, "user.name"),
      email: requireString(user.email, "user.email"),
      tokenVersion: requireNumber(user.tokenVersion, "user.tokenVersion"),
    },
    claims: {
      sub: requireString(claims.sub, "claims.sub"),
      clinicId: requireString(claims.clinicId, "claims.clinicId"),
      sessionId: requireString(claims.sessionId, "claims.sessionId"),
      tokenVersion: requireNumber(claims.tokenVersion, "claims.tokenVersion"),
      iat: requireNumber(claims.iat, "claims.iat"),
      exp: requireNumber(claims.exp, "claims.exp"),
    },
  };
}

function normalizeRefreshResponse(payload: unknown): RefreshResponse {
  if (!isRecord(payload) || !isRecord(payload.claims)) {
    throw new Error("Invalid refresh response payload");
  }

  const { claims } = payload;
  return {
    accessToken: requireString(payload.accessToken, "accessToken"),
    refreshToken: requireString(payload.refreshToken, "refreshToken"),
    tokenType: "Bearer",
    expiresInSeconds: requireNumber(payload.expiresInSeconds, "expiresInSeconds"),
    claims: {
      sub: requireString(claims.sub, "claims.sub"),
      clinicId: requireString(claims.clinicId, "claims.clinicId"),
      sessionId: requireString(claims.sessionId, "claims.sessionId"),
      tokenVersion: requireNumber(claims.tokenVersion, "claims.tokenVersion"),
      iat: requireNumber(claims.iat, "claims.iat"),
      exp: requireNumber(claims.exp, "claims.exp"),
    },
  };
}

function normalizeLogoutResponse(payload: unknown): LogoutResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid logout response payload");
  }

  return {
    revoked: requireBoolean(payload.revoked, "revoked"),
  };
}

async function postJson(
  transport: RequestTransport,
  path: string,
  payload: unknown,
): Promise<unknown> {
  const response = await transport(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return requestJson(response);
}

export type AuthApi = {
  login(payload: LoginRequest): Promise<LoginResponse>;
  refresh(payload: RefreshRequest): Promise<RefreshResponse>;
  logout(payload: LogoutRequest): Promise<LogoutResponse>;
};

export function createAuthApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
): AuthApi {
  const resolvedBaseUrl = baseUrl.replace(/\/+$/, "");

  const request = (path: string, payload: unknown) =>
    postJson(transport, `${resolvedBaseUrl}${path}`, payload);

  return {
    async login(payload) {
      const result = await request("/api/v1/auth/login", payload);
      return normalizeLoginResponse(result);
    },
    async refresh(payload) {
      const result = await request("/api/v1/auth/refresh", payload);
      return normalizeRefreshResponse(result);
    },
    async logout(payload) {
      const result = await request("/api/v1/auth/logout", payload);
      return normalizeLogoutResponse(result);
    },
  };
}
