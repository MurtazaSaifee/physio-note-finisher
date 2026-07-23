import type {
  CreatePatientRequest,
  ListPatientsResponse,
  PatientListItem,
  RecentSessionStatus,
  PatientSex,
  PatientProfileResponse,
  PatientRecord,
  UpdatePatientRequest,
} from "../../../../shared/contracts/patients";
import type {
  CopyForwardRequest,
  CopyForwardScaffold,
  PatientTimelineResponse,
  PriorSessionDetailResponse,
  SessionTimelineItem,
} from "../../../../shared/contracts/sessions";
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
    method: "GET" | "POST" | "PATCH";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<JsonResponse>;

type ProtectedRequestInit = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  accessToken: string;
  body?: unknown;
};

type ListPatientsInput = {
  query?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string | null;
};

type CopyForwardInput = CopyForwardRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid patients response field: ${field}`);
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
    throw new Error(`Invalid patients response field: ${field}`);
  }

  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Invalid patients response field: ${field}`);
  }

  return value;
}

function requirePatientSex(value: unknown, field: string): PatientSex | null {
  if (value === null) {
    return null;
  }

  if (
    value === "female" ||
    value === "male" ||
    value === "other" ||
    value === "prefer_not_to_say"
  ) {
    return value;
  }

  throw new Error(`Invalid patients response field: ${field}`);
}

function requireRecentSessionStatus(
  value: unknown,
  field: string,
): RecentSessionStatus {
  if (value === null) {
    return null;
  }

  if (value === "draft" || value === "finalized" || value === "reopened") {
    return value;
  }

  throw new Error(`Invalid patients response field: ${field}`);
}

function requireSuccessEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error(`Invalid patients response payload: ${field}`);
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

function normalizePatientRecord(payload: unknown): PatientRecord {
  if (!isRecord(payload)) {
    throw new Error("Invalid patient record payload");
  }

  return {
    id: requireString(payload.id, "id"),
    clinicId: requireString(payload.clinicId, "clinicId"),
    fullName: requireString(payload.fullName, "fullName"),
    dateOfBirth: requireNullableString(payload.dateOfBirth, "dateOfBirth"),
    sex: requirePatientSex(payload.sex, "sex"),
    phone: requireNullableString(payload.phone, "phone"),
    email: requireNullableString(payload.email, "email"),
    addressLine: requireNullableString(payload.addressLine, "addressLine"),
    clinicalNotes: requireNullableString(payload.clinicalNotes, "clinicalNotes"),
    conditionTags: requireStringArray(payload.conditionTags, "conditionTags"),
    lastVisitDate: requireNullableString(payload.lastVisitDate, "lastVisitDate"),
    unfinishedNoteCount: requireNumber(
      payload.unfinishedNoteCount,
      "unfinishedNoteCount",
    ),
    recentSessionStatus: requireRecentSessionStatus(
      payload.recentSessionStatus,
      "recentSessionStatus",
    ),
    nextAppointment: requireNullableString(payload.nextAppointment, "nextAppointment"),
    archivedAt: requireNullableString(payload.archivedAt, "archivedAt"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizePatientProfile(payload: unknown): PatientProfileResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid patient profile payload");
  }

  return {
    id: requireString(payload.id, "id"),
    fullName: requireString(payload.fullName, "fullName"),
    dateOfBirth: requireNullableString(payload.dateOfBirth, "dateOfBirth"),
    sex: requirePatientSex(payload.sex, "sex"),
    phone: requireNullableString(payload.phone, "phone"),
    email: requireNullableString(payload.email, "email"),
    addressLine: requireNullableString(payload.addressLine, "addressLine"),
    clinicalNotes: requireNullableString(payload.clinicalNotes, "clinicalNotes"),
    conditionTags: requireStringArray(payload.conditionTags, "conditionTags"),
    lastVisitDate: requireNullableString(payload.lastVisitDate, "lastVisitDate"),
    unfinishedNoteCount: requireNumber(
      payload.unfinishedNoteCount,
      "unfinishedNoteCount",
    ),
    recentSessionStatus: requireRecentSessionStatus(
      payload.recentSessionStatus,
      "recentSessionStatus",
    ),
    nextAppointment: requireNullableString(payload.nextAppointment, "nextAppointment"),
    archivedAt: requireNullableString(payload.archivedAt, "archivedAt"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizePatientListItem(payload: unknown): PatientListItem {
  if (!isRecord(payload)) {
    throw new Error("Invalid patient list payload");
  }

  return {
    id: requireString(payload.id, "id"),
    fullName: requireString(payload.fullName, "fullName"),
    dateOfBirth: requireNullableString(payload.dateOfBirth, "dateOfBirth"),
    sex: requirePatientSex(payload.sex, "sex"),
    phone: requireNullableString(payload.phone, "phone"),
    email: requireNullableString(payload.email, "email"),
    addressLine: requireNullableString(payload.addressLine, "addressLine"),
    conditionTags: requireStringArray(payload.conditionTags, "conditionTags"),
    lastVisitDate: requireNullableString(payload.lastVisitDate, "lastVisitDate"),
    unfinishedNoteCount: requireNumber(
      payload.unfinishedNoteCount,
      "unfinishedNoteCount",
    ),
    recentSessionStatus: requireRecentSessionStatus(
      payload.recentSessionStatus,
      "recentSessionStatus",
    ),
    nextAppointment: requireNullableString(payload.nextAppointment, "nextAppointment"),
    archivedAt: requireNullableString(payload.archivedAt, "archivedAt"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizeListPatientsResponse(payload: unknown): ListPatientsResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid patient list response");
  }

  const items = payload.items;
  if (!Array.isArray(items)) {
    throw new Error("Invalid patient list response field: items");
  }

  return {
    items: items.map(normalizePatientListItem),
    nextCursor:
      payload.nextCursor === null || payload.nextCursor === undefined
        ? null
        : requireString(payload.nextCursor, "nextCursor"),
  };
}

function normalizeSessionTimelineItem(payload: unknown): SessionTimelineItem {
  if (!isRecord(payload)) {
    throw new Error("Invalid session timeline payload");
  }

  const noteStatus = requireString(payload.noteStatus, "noteStatus");
  if (noteStatus !== "draft" && noteStatus !== "finalized" && noteStatus !== "reopened") {
    throw new Error("Invalid session timeline payload field: noteStatus");
  }

  return {
    id: requireString(payload.id, "id"),
    patientId: requireString(payload.patientId, "patientId"),
    sessionDate: requireString(payload.sessionDate, "sessionDate"),
    visitType: requireString(payload.visitType, "visitType"),
    noteStatus,
    finalNotePreview: requireNullableString(
      payload.finalNotePreview,
      "finalNotePreview",
    ),
    patientSummaryPreview: requireNullableString(
      payload.patientSummaryPreview,
      "patientSummaryPreview",
    ),
  };
}

function normalizePatientTimelineResponse(
  payload: unknown,
): PatientTimelineResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid patient timeline response");
  }

  const items = payload.items;
  if (!Array.isArray(items)) {
    throw new Error("Invalid patient timeline response field: items");
  }

  return {
    patientId: requireString(payload.patientId, "patientId"),
    items: items.map(normalizeSessionTimelineItem),
  };
}

function normalizePriorSessionDetail(
  payload: unknown,
): PriorSessionDetailResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid prior session payload");
  }

  const noteStatus = requireString(payload.noteStatus, "noteStatus");
  if (noteStatus !== "draft" && noteStatus !== "finalized" && noteStatus !== "reopened") {
    throw new Error("Invalid prior session payload field: noteStatus");
  }

  return {
    id: requireString(payload.id, "id"),
    patientId: requireString(payload.patientId, "patientId"),
    sessionDate: requireString(payload.sessionDate, "sessionDate"),
    visitType: requireString(payload.visitType, "visitType"),
    noteStatus,
    finalNote: requireNullableString(payload.finalNote, "finalNote"),
    patientSummary: requireNullableString(payload.patientSummary, "patientSummary"),
    priorPlan: requireNullableString(payload.priorPlan, "priorPlan"),
    carryForwardContext: requireNullableString(
      payload.carryForwardContext,
      "carryForwardContext",
    ),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizeCopyForwardScaffold(
  payload: unknown,
): CopyForwardScaffold {
  if (!isRecord(payload)) {
    throw new Error("Invalid copy-forward payload");
  }

  return {
    patientId: requireString(payload.patientId, "patientId"),
    sourceSessionId: requireString(payload.sourceSessionId, "sourceSessionId"),
    selectedSections: requireStringArray(payload.selectedSections, "selectedSections") as CopyForwardScaffold["selectedSections"],
    priorPlan: requireNullableString(payload.priorPlan, "priorPlan"),
    carryForwardContext: requireNullableString(
      payload.carryForwardContext,
      "carryForwardContext",
    ),
    sourceSessionDate: requireString(payload.sourceSessionDate, "sourceSessionDate"),
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

export type PatientsApi = {
  listPatients(
    accessToken: string,
    input?: ListPatientsInput,
  ): Promise<ListPatientsResponse>;
  createPatient(
    accessToken: string,
    input: CreatePatientRequest,
  ): Promise<PatientRecord>;
  updatePatient(
    accessToken: string,
    patientId: string,
    input: UpdatePatientRequest,
  ): Promise<PatientRecord>;
  archivePatient(
    accessToken: string,
    patientId: string,
    archived: boolean,
  ): Promise<PatientRecord>;
  getPatientProfile(
    accessToken: string,
    patientId: string,
  ): Promise<PatientProfileResponse>;
  getPatientTimeline(
    accessToken: string,
    patientId: string,
  ): Promise<PatientTimelineResponse>;
  getPriorSession(
    accessToken: string,
    patientId: string,
    sessionId: string,
  ): Promise<PriorSessionDetailResponse>;
  copyForwardFromSession(
    accessToken: string,
    patientId: string,
    sessionId: string,
    input: CopyForwardInput,
  ): Promise<CopyForwardScaffold>;
};

export function createPatientsApi(
  baseUrl: string,
  transport: RequestTransport = globalThis.fetch as RequestTransport,
): PatientsApi {
  const resolvedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    async listPatients(accessToken, input = {}) {
      const searchParams = new URLSearchParams();

      if (input.query !== undefined && input.query.trim().length > 0) {
        searchParams.set("query", input.query.trim());
      }

      searchParams.set("includeArchived", String(Boolean(input.includeArchived)));

      if (input.limit !== undefined) {
        searchParams.set("limit", String(input.limit));
      }

      if (input.cursor !== undefined && input.cursor !== null) {
        searchParams.set("cursor", input.cursor);
      }

      const queryString = searchParams.toString();
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/patients${queryString.length > 0 ? `?${queryString}` : ""}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "listPatients", normalizeListPatientsResponse);
    },

    async createPatient(accessToken, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: "/api/v1/patients",
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "createPatient", normalizePatientRecord);
    },

    async updatePatient(accessToken, patientId, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "PATCH",
        path: `/api/v1/patients/${patientId}`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "updatePatient", normalizePatientRecord);
    },

    async archivePatient(accessToken, patientId, archived) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: `/api/v1/patients/${patientId}/archive`,
        accessToken,
        body: { archived },
      });

      return normalizeEnvelope(payload, "archivePatient", normalizePatientRecord);
    },

    async getPatientProfile(accessToken, patientId) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/patients/${patientId}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getPatientProfile", normalizePatientProfile);
    },

    async getPatientTimeline(accessToken, patientId) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/patients/${patientId}/timeline`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getPatientTimeline", normalizePatientTimelineResponse);
    },

    async getPriorSession(accessToken, patientId, sessionId) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "GET",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getPriorSession", normalizePriorSessionDetail);
    },

    async copyForwardFromSession(accessToken, patientId, sessionId, input) {
      const payload = await requestProtectedJson(transport, resolvedBaseUrl, {
        method: "POST",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}/copy-forward`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "copyForwardFromSession", normalizeCopyForwardScaffold);
    },
  };
}

export const patientsApi = createPatientsApi(resolveDefaultBaseUrl());
