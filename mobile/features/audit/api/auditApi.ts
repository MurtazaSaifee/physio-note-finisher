import type { AuditEventType, AuditHistoryResponse } from "../../../../shared/contracts/audit";
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
    method: "GET";
    headers: Record<string, string>;
  },
) => Promise<JsonResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid audit response field: ${field}`);
  }

  return value;
}

function requireStringOrNull(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, field);
}

function requireRecordEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`Invalid audit response payload: ${field}`);
  }

  return payload.data;
}

function normalizeAuditEvent(payload: unknown) {
  if (!isRecord(payload)) {
    throw new Error("Invalid audit event payload");
  }

  const base = {
    id: requireString(payload.id, "id"),
    eventType: requireString(payload.eventType, "eventType") as AuditEventType,
    sessionId: requireString(payload.sessionId, "sessionId"),
    userId: requireString(payload.userId, "userId"),
    timestamp: requireString(payload.timestamp, "timestamp"),
    metadata: payload.metadata === null || payload.metadata === undefined
      ? null
      : (payload.metadata as Record<string, unknown>),
  };

  if (isRecord(payload.user)) {
    return {
      ...base,
      user: {
        firstName: requireString(payload.user.firstName, "user.firstName"),
        lastName: requireString(payload.user.lastName, "user.lastName"),
      },
    };
  }

  return base;
}

function normalizeAuditHistoryResponse(payload: unknown): AuditHistoryResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid audit history payload");
  }

  if (!Array.isArray(payload.events)) {
    throw new Error("Invalid audit response field: events");
  }

  return {
    sessionId: requireString(payload.sessionId, "sessionId"),
    events: payload.events.map(normalizeAuditEvent),
  };
}

async function requestProtectedJson(
  transport: RequestTransport,
  baseUrl: string,
  path: string,
  accessToken: string,
): Promise<unknown> {
  const response = await transport(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  return requestJson(response);
}

export function createAuditApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async getAuditHistory(
      accessToken: string,
      sessionId: string,
    ): Promise<AuditHistoryResponse> {
      const payload = await requestProtectedJson(
        transport,
        normalizedBaseUrl,
        `/api/v1/audit/sessions/${encodeURIComponent(sessionId)}`,
        accessToken,
      );

      return normalizeAuditHistoryResponse(requireRecordEnvelope(payload, "getAuditHistory"));
    },
  };
}

export const auditApi = createAuditApi(resolveApiBaseUrl());
