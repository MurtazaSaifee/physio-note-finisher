import type {
  DashboardFilters,
  DashboardResponse,
  DashboardSessionCard,
  DashboardUpcomingCard,
} from "../../../../shared/contracts/dashboard";
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
    throw new Error(`Invalid dashboard response field: ${field}`);
  }

  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Invalid dashboard response field: ${field}`);
  }

  return value;
}

function requireDashboardNoteStatus(
  value: unknown,
  field: string,
): DashboardFilters["noteStatus"] {
  if (
    value === "draft" ||
    value === "finalized" ||
    value === "reopened" ||
    value === "all"
  ) {
    return value;
  }

  throw new Error(`Invalid dashboard response field: ${field}`);
}

function requireSuccessEnvelope(payload: unknown): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error("Invalid dashboard response payload");
  }

  return payload.data;
}

function normalizeSessionCard(payload: unknown): DashboardSessionCard {
  if (!isRecord(payload)) {
    throw new Error("Invalid dashboard session payload");
  }

  const noteStatus = requireString(payload.noteStatus, "noteStatus");
  if (
    noteStatus !== "draft" &&
    noteStatus !== "finalized" &&
    noteStatus !== "reopened"
  ) {
    throw new Error("Invalid dashboard response field: noteStatus");
  }

  return {
    sessionId: requireString(payload.sessionId, "sessionId"),
    patientId: requireString(payload.patientId, "patientId"),
    patientName: requireString(payload.patientName, "patientName"),
    sessionDate: requireString(payload.sessionDate, "sessionDate"),
    visitType: requireString(payload.visitType, "visitType"),
    noteStatus,
    templateKey:
      payload.templateKey === null
        ? null
        : requireString(payload.templateKey, "templateKey"),
    finalNote:
      payload.finalNote === null
        ? null
        : requireString(payload.finalNote, "finalNote"),
    patientSummary:
      payload.patientSummary === null
        ? null
        : requireString(payload.patientSummary, "patientSummary"),
    conditionTags: Array.isArray(payload.conditionTags)
      ? payload.conditionTags.filter((tag): tag is string => typeof tag === "string")
      : [],
  };
}

function normalizeDashboardResponse(payload: unknown): DashboardResponse {
  if (!isRecord(payload)) {
    throw new Error("Invalid dashboard response");
  }

  if (!isRecord(payload.upcoming)) {
    throw new Error("Invalid dashboard response field: upcoming");
  }

  if (!Array.isArray(payload.recentSessions)) {
    throw new Error("Invalid dashboard response field: recentSessions");
  }

  if (!isRecord(payload.filters)) {
    throw new Error("Invalid dashboard response field: filters");
  }

  const noteStatus = payload.filters.noteStatus;
  const normalizedNoteStatus =
    noteStatus === undefined
      ? undefined
      : requireDashboardNoteStatus(noteStatus, "filters.noteStatus");

  const filters: DashboardFilters = {};

  if (payload.filters.date !== undefined) {
    filters.date = requireString(payload.filters.date, "filters.date");
  }

  if (payload.filters.timezoneOffset !== undefined) {
    filters.timezoneOffset = requireString(
      payload.filters.timezoneOffset,
      "filters.timezoneOffset",
    );
  }

  if (payload.filters.patientId !== undefined) {
    filters.patientId = requireString(payload.filters.patientId, "filters.patientId");
  }

  if (normalizedNoteStatus !== undefined) {
    filters.noteStatus = normalizedNoteStatus;
  }

  if (payload.filters.search !== undefined) {
    filters.search = requireString(payload.filters.search, "filters.search");
  }

  if (payload.filters.page !== undefined) {
    filters.page = requireNumber(payload.filters.page, "filters.page");
  }

  if (payload.filters.pageSize !== undefined) {
    filters.pageSize = requireNumber(payload.filters.pageSize, "filters.pageSize");
  }

  const upcoming: DashboardUpcomingCard = {
    label: "Upcoming",
    body: requireString(payload.upcoming.body, "upcoming.body"),
    ...(payload.upcoming.appointmentId !== undefined && payload.upcoming.appointmentId !== null
      ? {
          appointmentId: requireString(
            payload.upcoming.appointmentId,
            "upcoming.appointmentId",
          ),
        }
      : {}),
    ...(payload.upcoming.patientName !== undefined && payload.upcoming.patientName !== null
      ? {
          patientName: requireString(
            payload.upcoming.patientName,
            "upcoming.patientName",
          ),
        }
      : {}),
    ...(payload.upcoming.scheduledAt !== undefined && payload.upcoming.scheduledAt !== null
      ? {
          scheduledAt: requireString(
            payload.upcoming.scheduledAt,
            "upcoming.scheduledAt",
          ),
        }
      : {}),
    ...(payload.upcoming.durationMinutes !== undefined &&
    payload.upcoming.durationMinutes !== null
      ? {
          durationMinutes: requireNumber(
            payload.upcoming.durationMinutes,
            "upcoming.durationMinutes",
          ),
        }
      : {}),
    ...(payload.upcoming.visitType !== undefined && payload.upcoming.visitType !== null
      ? {
          visitType: requireString(
            payload.upcoming.visitType,
            "upcoming.visitType",
          ),
        }
      : {}),
  };

  return {
    upcoming,
    recentSessions: payload.recentSessions.map(normalizeSessionCard),
    filters,
    page: requireNumber(payload.page, "page"),
    pageSize: requireNumber(payload.pageSize, "pageSize"),
    total: requireNumber(payload.total, "total"),
    totalPages: requireNumber(payload.totalPages, "totalPages"),
  };
}

function buildQuery(filters: DashboardFilters): string {
  const params = new URLSearchParams();

  if (filters.date) {
    params.set("date", filters.date);
  }

  if (filters.timezoneOffset) {
    params.set("timezoneOffset", filters.timezoneOffset);
  }

  if (filters.patientId) {
    params.set("patientId", filters.patientId);
  }

  if (filters.noteStatus) {
    params.set("noteStatus", filters.noteStatus);
  }

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (typeof filters.page === "number") {
    params.set("page", String(filters.page));
  }

  if (typeof filters.pageSize === "number") {
    params.set("pageSize", String(filters.pageSize));
  }

  return params.toString();
}

async function requestDashboard(
  transport: RequestTransport,
  baseUrl: string,
  accessToken: string,
  filters: DashboardFilters,
): Promise<DashboardResponse> {
  const query = buildQuery(filters);
  const response = await transport(
    `${baseUrl}/api/v1/dashboard/sessions${query ? `?${query}` : ""}`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
  const payload = await requestJson<unknown>(response);

  return normalizeDashboardResponse(requireSuccessEnvelope(payload));
}

export function createDashboardApi(
  baseUrl = resolveApiBaseUrl(),
  transport: RequestTransport = fetch as unknown as RequestTransport,
) {
  return {
    listDashboardSessions: (accessToken: string, filters: DashboardFilters = {}) =>
      requestDashboard(transport, baseUrl, accessToken, filters),
  };
}

export const dashboardApi = createDashboardApi();
