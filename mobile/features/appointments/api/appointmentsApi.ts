import type {
  AppointmentDetailResponse,
  CreateAppointmentRequest,
  StartSessionFromAppointmentRequest,
  StartSessionFromAppointmentResponse,
  UpdateAppointmentRequest,
} from "../../../../shared/contracts/appointments";
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
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<JsonResponse>;

type ProtectedRequestInit = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid appointments response field: ${field}`);
  }
  return value;
}

function requireNullableString(
  value: unknown,
  field: string,
): string | null {
  if (value === null) {
    return null;
  }
  return requireString(value, field);
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid appointments response field: ${field}`);
  }
  return value;
}

function requireAppointmentStatus(
  value: unknown,
  field: string,
): "upcoming" | "completed" | "cancelled" | "missed" {
  if (
    value === "upcoming" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "missed"
  ) {
    return value;
  }
  throw new Error(`Invalid appointments response field: ${field}`);
}

function requireSyncStatus(
  value: unknown,
  field: string,
): "manual" | "synced" | "pending" | "failed" {
  if (
    value === "manual" ||
    value === "synced" ||
    value === "pending" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error(`Invalid appointments response field: ${field}`);
}

function requireSuccessEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`Invalid appointments response payload: ${field}`);
  }
  return payload.data;
}

async function requestProtectedJson(
  transport: RequestTransport,
  baseUrl: string,
  init: ProtectedRequestInit,
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

function normalizeAppointmentDetail(payload: unknown): AppointmentDetailResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid appointment detail payload");
  }

  return {
    id: requireString(payload.id, "id"),
    clinicId: requireString(payload.clinicId, "clinicId"),
    patientId: requireNullableString(payload.patientId, "patientId"),
    patientName: requireString(payload.patientName, "patientName"),
    scheduledAt: requireString(payload.scheduledAt, "scheduledAt"),
    durationMinutes: requireNumber(payload.durationMinutes, "durationMinutes"),
    status: requireAppointmentStatus(payload.status, "status"),
    linkedSessionId: requireNullableString(payload.linkedSessionId, "linkedSessionId"),
    reminderText: requireString(payload.reminderText, "reminderText"),
    notes: requireNullableString(payload.notes, "notes"),
    syncStatus: requireSyncStatus(payload.syncStatus, "syncStatus"),
    syncedAt: requireNullableString(payload.syncedAt, "syncedAt"),
    googleEventId: requireNullableString(payload.googleEventId, "googleEventId"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizeAppointmentListResponse(payload: unknown): { items: AppointmentDetailResponse[] } {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? payload.items
      : undefined;
  if (!Array.isArray(items)) {
    throw new Error("Invalid appointment list response field: items");
  }

  return {
    items: items.map(normalizeAppointmentDetail),
  };
}

function normalizeStartSessionResponse(payload: unknown): StartSessionFromAppointmentResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid start session response");
  }

  return {
    appointmentId: requireString(payload.appointmentId, "appointmentId"),
    sessionId: requireString(payload.sessionId, "sessionId"),
    patientId: requireString(payload.patientId, "patientId"),
    linkedSessionId: requireString(payload.linkedSessionId, "linkedSessionId"),
  };
}

function normalizeEnvelope<T>(
  payload: unknown,
  field: string,
  normalizer: (value: unknown) => T,
): T {
  return normalizer(requireSuccessEnvelope(payload, field));
}

function resolveDefaultBaseUrl(): string {
  return resolveApiBaseUrl();
}

export type AppointmentsApi = {
  listAppointments(
    accessToken: string,
    date?: string,
    timezoneOffset?: string,
  ): Promise<{ items: AppointmentDetailResponse[] }>;
  getAppointmentDetail(
    accessToken: string,
    appointmentId: string,
  ): Promise<AppointmentDetailResponse>;
  createAppointment(
    accessToken: string,
    input: CreateAppointmentRequest,
  ): Promise<AppointmentDetailResponse>;
  updateAppointment(
    accessToken: string,
    appointmentId: string,
    input: UpdateAppointmentRequest,
  ): Promise<AppointmentDetailResponse>;
  cancelAppointment(
    accessToken: string,
    appointmentId: string,
  ): Promise<AppointmentDetailResponse>;
  getAppointmentHistory(
    accessToken: string,
    limit?: number,
  ): Promise<{ items: AppointmentDetailResponse[] }>;
  startSessionFromAppointment(
    accessToken: string,
    appointmentId: string,
    input: StartSessionFromAppointmentRequest,
  ): Promise<StartSessionFromAppointmentResponse>;
};

export function createAppointmentsApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
): AppointmentsApi {
  const resolvedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async listAppointments(accessToken, date, timezoneOffset) {
      const searchParams = new URLSearchParams();
      if (date !== undefined) {
        searchParams.set("date", date);
      }
      if (timezoneOffset !== undefined) {
        searchParams.set("timezoneOffset", timezoneOffset);
      }
      const queryString = searchParams.toString();
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/appointments${queryString.length > 0 ? `?${queryString}` : ""}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "listAppointments", normalizeAppointmentListResponse);
    },

    async getAppointmentDetail(accessToken, appointmentId) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/appointments/${appointmentId}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getAppointmentDetail", normalizeAppointmentDetail);
    },

    async createAppointment(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: "/api/v1/appointments",
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "createAppointment", normalizeAppointmentDetail);
    },

    async updateAppointment(accessToken, appointmentId, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "PUT",
        path: `/api/v1/appointments/${appointmentId}`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "updateAppointment", normalizeAppointmentDetail);
    },

    async cancelAppointment(accessToken, appointmentId) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: `/api/v1/appointments/${appointmentId}/cancel`,
        accessToken,
      });

      return normalizeEnvelope(payload, "cancelAppointment", normalizeAppointmentDetail);
    },

    async getAppointmentHistory(accessToken, limit) {
      const searchParams = new URLSearchParams();
      if (limit !== undefined) {
        searchParams.set("limit", String(limit));
      }
      const queryString = searchParams.toString();
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/appointments/history${queryString.length > 0 ? `?${queryString}` : ""}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getAppointmentHistory", normalizeAppointmentListResponse);
    },

    async startSessionFromAppointment(accessToken, appointmentId, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: `/api/v1/appointments/${appointmentId}/start-session`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "startSessionFromAppointment", normalizeStartSessionResponse);
    },
  };
}

export const appointmentsApi = createAppointmentsApi(resolveDefaultBaseUrl());
