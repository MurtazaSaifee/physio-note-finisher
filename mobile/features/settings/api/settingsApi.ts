import type {
  ChangePasswordRequest,
  ProfileUpdateRequest,
} from "../../../../shared/contracts/auth";
import type {
  NotificationPreferenceResponse,
  UpdateNotificationPreferenceRequest,
} from "../../../../shared/contracts/appointments";
import type { UpdateRetentionPolicyRequest } from "../../../../shared/contracts/users";
import { requestJson } from "../../runtime/requestJson";
import { resolveApiBaseUrl } from "../../runtime/apiBaseUrl";

type JsonResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type RequestTransport = (
  input: string,
  init: {
    method: "GET" | "POST" | "PUT";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<JsonResponse>;

export type ClinicianProfile = {
  id: string;
  clinicId: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
  tokenVersion: number;
  audioRetentionPeriod: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid settings response field: ${field}`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number") {
    throw new Error(`Invalid settings response field: ${field}`);
  }

  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid settings response field: ${field}`);
  }

  return value;
}

function requireSuccessEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`Invalid settings response payload: ${field}`);
  }
  return payload.data;
}

function normalizeProfile(payload: unknown): ClinicianProfile {
  if (!isRecord(payload) || !isRecord(payload.user)) {
    throw new Error("Invalid settings profile payload");
  }

  const { user } = payload;
  return {
    id: requireString(user.id, "user.id"),
    clinicId: requireString(user.clinicId, "user.clinicId"),
    firstName: requireString(user.firstName, "user.firstName"),
    lastName: requireString(user.lastName, "user.lastName"),
    email: requireString(user.email, "user.email"),
    emailVerified: requireBoolean(user.emailVerified, "user.emailVerified"),
    tokenVersion: requireNumber(user.tokenVersion, "user.tokenVersion"),
    audioRetentionPeriod:
      typeof user.audioRetentionPeriod === "string"
        ? user.audioRetentionPeriod
        : "30d",
  };
}

async function requestProtectedJson(
  transport: RequestTransport,
  baseUrl: string,
  init: {
    method: "GET" | "POST" | "PUT";
    path: string;
    accessToken: string;
    body?: unknown;
  },
): Promise<unknown> {
  const response = await transport(`${baseUrl}${init.path}`, {
    method: init.method,
    headers: {
      authorization: `Bearer ${init.accessToken}`,
      ...(init.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
    },
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body) }
      : {}),
  });

  return requestJson(response);
}

export type SettingsApi = {
  getProfile(accessToken: string): Promise<ClinicianProfile>;
  updateProfile(
    accessToken: string,
    input: ProfileUpdateRequest,
  ): Promise<ClinicianProfile>;
  updateRetentionPolicy(
    accessToken: string,
    input: UpdateRetentionPolicyRequest,
  ): Promise<ClinicianProfile>;
  changePassword(
    accessToken: string,
    input: ChangePasswordRequest,
  ): Promise<{ updated: boolean }>;
  getNotificationPreferences(
    accessToken: string,
  ): Promise<NotificationPreferenceResponse>;
  updateNotificationPreferences(
    accessToken: string,
    input: UpdateNotificationPreferenceRequest,
  ): Promise<NotificationPreferenceResponse>;
};

export function createSettingsApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
): SettingsApi {
  const resolvedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async getProfile(accessToken) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: "/api/v1/users/me",
        accessToken,
      });

      return normalizeProfile(payload);
    },

    async updateProfile(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "PUT",
        path: "/api/v1/users/me",
        accessToken,
        body: input,
      });

      return normalizeProfile(payload);
    },

    async updateRetentionPolicy(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "PUT",
        path: "/api/v1/users/me/retention",
        accessToken,
        body: input,
      });

      return normalizeProfile(payload);
    },

    async changePassword(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: "/api/v1/auth/change-password",
        accessToken,
        body: input,
      });

      if (!isRecord(payload) || payload.updated !== true) {
        throw new Error("Invalid password change response payload");
      }

      return { updated: true };
    },

    async getNotificationPreferences(accessToken) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: "/api/v1/notifications/preferences",
        accessToken,
      });

      const data = requireSuccessEnvelope(payload, "getNotificationPreferences");
      if (!isRecord(data)) {
        throw new Error("Invalid notification preferences response");
      }

      return {
        defaultReminderTiming: requireTimingOption(data.defaultReminderTiming, "defaultReminderTiming"),
        pushEnabled: requireBoolean(data.pushEnabled, "pushEnabled"),
      };
    },

    async updateNotificationPreferences(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "PUT",
        path: "/api/v1/notifications/preferences",
        accessToken,
        body: input,
      });

      const data = requireSuccessEnvelope(payload, "updateNotificationPreferences");
      if (!isRecord(data)) {
        throw new Error("Invalid notification preferences response");
      }

      return {
        defaultReminderTiming: requireTimingOption(data.defaultReminderTiming, "defaultReminderTiming"),
        pushEnabled: requireBoolean(data.pushEnabled, "pushEnabled"),
      };
    },
  };
}

function requireTimingOption(
  value: unknown,
  field: string,
): "30m" | "1h" | "2h" | "1d" {
  if (value === "30m" || value === "1h" || value === "2h" || value === "1d") {
    return value;
  }
  throw new Error(`Invalid settings response field: ${field}`);
}

export const settingsApi = createSettingsApi(resolveApiBaseUrl());
