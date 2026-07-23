import type {
  CreateExportRecordRequest,
  ExportRecordResponse,
  ListPatientExportRecordsResponse,
} from "../../../../shared/contracts/exports";
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
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<JsonResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid exports response field: ${field}`);
  }

  return value;
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, field);
}

function requireNullableNumber(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number") {
    throw new Error(`Invalid exports response field: ${field}`);
  }

  return value;
}

function requireRecordEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`Invalid exports response payload: ${field}`);
  }

  return payload.data;
}

function normalizeExportRecord(payload: unknown): ExportRecordResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid export record payload");
  }

  const action = requireString(payload.action, "action");
  const type = requireString(payload.type, "type");
  const format = requireString(payload.format, "format");

  if (action !== "saved" && action !== "shared" && action !== "copied") {
    throw new Error("Invalid exports response field: action");
  }
  if (type !== "fullNote" && type !== "patientSummary") {
    throw new Error("Invalid exports response field: type");
  }
  if (format !== "pdf" && format !== "text") {
    throw new Error("Invalid exports response field: format");
  }

  return {
    id: requireString(payload.id, "id"),
	    sessionId: requireString(payload.sessionId, "sessionId"),
	    action,
	    type,
    format,
    exportedByUserId: requireString(payload.exportedByUserId, "exportedByUserId"),
    fileStatus: requireNullableString(payload.fileStatus, "fileStatus"),
    fileError: requireNullableString(payload.fileError, "fileError"),
    fileExpiresAt: requireNullableString(payload.fileExpiresAt, "fileExpiresAt"),
    fileSizeBytes: requireNullableNumber(payload.fileSizeBytes, "fileSizeBytes"),
    createdAt: requireString(payload.createdAt, "createdAt"),
  };
}

function normalizeExportRecordList(payload: unknown): ListPatientExportRecordsResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid export record list payload");
  }

  if (!Array.isArray(payload.records)) {
    throw new Error("Invalid exports response field: records");
  }

  return {
    patientId: requireString(payload.patientId, "patientId"),
    records: payload.records.map(normalizeExportRecord),
  };
}

async function requestProtectedJson(
  transport: RequestTransport,
  baseUrl: string,
  path: string,
  accessToken: string,
  clinicId: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<unknown> {
  const response = await transport(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "x-clinic-id": clinicId,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return requestJson(response);
}

export function createExportsApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async recordExportAction(
      accessToken: string,
      clinicId: string,
      patientId: string,
      sessionId: string,
      input: CreateExportRecordRequest,
    ): Promise<ExportRecordResponse> {
      const payload = await requestProtectedJson(
        transport,
        normalizedBaseUrl,
        `/api/v1/patients/${encodeURIComponent(patientId)}/sessions/${encodeURIComponent(sessionId)}/export-records`,
        accessToken,
        clinicId,
        "POST",
        input,
      );

      return normalizeExportRecord(requireRecordEnvelope(payload, "recordExportAction"));
    },
    async listPatientExportRecords(
      accessToken: string,
      clinicId: string,
      patientId: string,
    ): Promise<ListPatientExportRecordsResponse> {
      const payload = await requestProtectedJson(
        transport,
        normalizedBaseUrl,
        `/api/v1/patients/${encodeURIComponent(patientId)}/export-records`,
        accessToken,
        clinicId,
        "GET",
      );

      return normalizeExportRecordList(requireRecordEnvelope(payload, "listPatientExportRecords"));
    },
  };
}

export const exportsApi = createExportsApi(resolveApiBaseUrl());
