import { requestJson } from "../../runtime/requestJson";
import type {
  EmailVerificationRequiredResponse,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  OtpSendResponse,
  OtpSendRequest,
  OtpVerifyRequest,
  RefreshRequest,
  RefreshResponse,
  SignupRequest,
  SignupResponse,
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

type HttpErrorLike = {
  status?: unknown;
  details?: unknown;
};

export function isEmailVerificationRequiredError(
  error: unknown,
): error is Error & { status: 403; details: EmailVerificationRequiredResponse } {
  if (!error || typeof error !== "object") {
    return false;
  }

  const { status, details } = error as HttpErrorLike;
  return (
    status === 403 &&
    isRecord(details) &&
    details.error === "email_verification_required" &&
    typeof details.email === "string" &&
    details.otpRequired === true
  );
}

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

function requireClaims(
  value: unknown,
  field: string,
): import("../../../../shared/contracts/auth").JwtClaims {
  if (!isRecord(value)) {
    throw new Error(`Invalid auth response field: ${field}`);
  }

  return {
    sub: requireString(value.sub, `${field}.sub`),
    clinicId: requireString(value.clinicId, `${field}.clinicId`),
    sessionId: requireString(value.sessionId, `${field}.sessionId`),
    tokenVersion: requireNumber(value.tokenVersion, `${field}.tokenVersion`),
    iat: requireNumber(value.iat, `${field}.iat`),
    exp: requireNumber(value.exp, `${field}.exp`),
  };
}

function normalizeLoginResponse(payload: unknown): LoginResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid login response payload");
  }

  const user = payload.user;
  if (!isRecord(user)) {
    throw new Error("Invalid login response field: user");
  }

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
    claims: requireClaims(payload.claims, "claims"),
  };
}

function normalizeRefreshResponse(payload: unknown): RefreshResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid refresh response payload");
  }

  return {
    accessToken: requireString(payload.accessToken, "accessToken"),
    refreshToken: requireString(payload.refreshToken, "refreshToken"),
    tokenType: "Bearer",
    expiresInSeconds: requireNumber(payload.expiresInSeconds, "expiresInSeconds"),
    claims: requireClaims(payload.claims, "claims"),
  };
}

function normalizeLogoutResponse(payload: unknown): LogoutResponse {
  if (!isRecord(payload) || typeof payload.revoked !== "boolean") {
    return { revoked: false };
  }

  return {
    revoked: payload.revoked,
  };
}

function normalizeSignupResponse(payload: unknown): SignupResponse {
  if (!isRecord(payload) || !isRecord(payload.user)) {
    throw new Error("Invalid signup response payload");
  }

  return {
    user: {
      email: requireString(payload.user.email, "user.email"),
      emailVerified:
        typeof payload.user.emailVerified === "boolean"
          ? payload.user.emailVerified
          : false,
    },
    otpRequired: payload.otpRequired === true,
    otpSent: payload.otpSent === true,
  };
}

function normalizeOtpVerifyResponse(payload: unknown): {
  accessToken: string;
  refreshToken: string;
} {
  if (!isRecord(payload)) {
    throw new Error("Invalid OTP response payload");
  }

  return {
    accessToken: requireString(payload.accessToken, "accessToken"),
    refreshToken: requireString(payload.refreshToken, "refreshToken"),
  };
}

function normalizeOtpSendResponse(payload: unknown): OtpSendResponse {
  if (!isRecord(payload) || typeof payload.sent !== "boolean") {
    throw new Error("Invalid OTP send response payload");
  }

  const result: OtpSendResponse = {
    sent: payload.sent,
  };

  if (typeof payload.remainingResends === "number") {
    result.remainingResends = payload.remainingResends;
  }
  if (typeof payload.retryAfterSeconds === "number") {
    result.retryAfterSeconds = payload.retryAfterSeconds;
  }
  if (
    payload.error === "otp_resend_too_soon" ||
    payload.error === "otp_resend_limit_reached" ||
    payload.error === "otp_delivery_failed"
  ) {
    result.error = payload.error;
  }

  return result;
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
  signup(payload: SignupRequest): Promise<SignupResponse>;
  sendOtp(payload: OtpSendRequest): Promise<OtpSendResponse>;
  verifyOtp(payload: OtpVerifyRequest): Promise<{
    accessToken: string;
    refreshToken: string;
  }>;
  refresh(payload: RefreshRequest): Promise<RefreshResponse>;
  logout(payload: LogoutRequest): Promise<LogoutResponse>;
  initiateForgotPassword(payload: { email: string }): Promise<OtpSendResponse>;
  resetForgotPassword(payload: import("../../../../shared/contracts/auth").ForgotPasswordResetRequest): Promise<{ updated: boolean }>;
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
    async signup(payload) {
      const result = await request("/api/v1/auth/signup", payload);
      return normalizeSignupResponse(result);
    },
    async sendOtp(payload) {
      const result = await request("/api/v1/auth/otp/send", payload);
      return normalizeOtpSendResponse(result);
    },
    async verifyOtp(payload) {
      const result = await request("/api/v1/auth/otp/verify", payload);
      return normalizeOtpVerifyResponse(result);
    },
    async refresh(payload) {
      const result = await request("/api/v1/auth/refresh", payload);
      return normalizeRefreshResponse(result);
    },
    async logout(payload) {
      const result = await request("/api/v1/auth/logout", payload);
      return normalizeLogoutResponse(result);
    },
    async initiateForgotPassword(payload) {
      const result = await request("/api/v1/auth/forgot-password/initiate", payload);
      return normalizeOtpSendResponse(result);
    },
    async resetForgotPassword(payload) {
      const result = await request("/api/v1/auth/forgot-password/reset", payload);
      if (!isRecord(result) || result.updated !== true) {
        throw new Error("Failed to reset password");
      }
      return { updated: true };
    },
  };
}
