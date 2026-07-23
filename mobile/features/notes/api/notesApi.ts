import type {
  ConditionTemplate,
  ConditionTemplateListResponse,
  TemplateKey,
  TemplateCategory,
  CreateManualNoteRequest,
  NoteLifecycleResponse,
  ProgressNoteResponse,
  SaveManualNoteRequest,
  SoapSections,
} from "../../../../shared/contracts/notes";
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
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers: Record<string, string>;
    body?: string;
  },
) => Promise<JsonResponse>;

type ProtectedRequestInit = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  accessToken: string;
  body?: unknown;
};

type ConditionTemplateFilters = {
  category?: TemplateCategory;
  query?: string;
  patientId?: string;
  limit?: number;
};

export type CustomTemplateCategoryDto = {
  id: string;
  label: TemplateCategory;
  createdAt: string;
  updatedAt: string;
};

export type CustomTemplateDto = {
  id: string;
  name: string;
  source: "custom";
  categories: TemplateCategory[];
  sections: SoapSections;
  createdAt: string;
  updatedAt: string;
};

class InvalidNotesResponseError extends Error {
  constructor(field: string) {
    super(`Invalid notes response: ${field}`);
    this.name = "InvalidNotesResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new InvalidNotesResponseError(field);
  }

  return value;
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, field);
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new InvalidNotesResponseError(field);
  }

  return [...value];
}

function requireNoteStatus(value: unknown, field: string): ProgressNoteResponse["noteStatus"] {
  if (value === "draft" || value === "finalized" || value === "reopened") {
    return value;
  }

  throw new InvalidNotesResponseError(field);
}

function requireSoapSections(value: unknown): SoapSections {
  if (!isRecord(value)) {
    throw new InvalidNotesResponseError("sections");
  }

  return {
    subjective: requireNullableString(value.subjective, "sections.subjective"),
    objective: requireNullableString(value.objective, "sections.objective"),
    assessment: requireNullableString(value.assessment, "sections.assessment"),
    plan: requireNullableString(value.plan, "sections.plan"),
  };
}

function requireTemplateKey(
  value: unknown,
  field: string,
): TemplateKey | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new InvalidNotesResponseError(field);
}

function requireTemplateCategory(
  value: unknown,
  field: string,
): TemplateCategory {
  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    return value.trim();
  }

  throw new InvalidNotesResponseError(field);
}

function requireTemplateSource(
  value: unknown,
  field: string,
): NonNullable<ProgressNoteResponse["templateProvenance"]>["source"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "built_in" || value === "custom") {
    return value;
  }
  throw new InvalidNotesResponseError(field);
}

function requireTemplateApplyMode(
  value: unknown,
  field: string,
): NonNullable<ProgressNoteResponse["templateProvenance"]>["applyMode"] {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "fillBlank" || value === "replaceAll") {
    return value;
  }
  throw new InvalidNotesResponseError(field);
}

function normalizeTemplateProvenance(
  payload: unknown,
): NonNullable<ProgressNoteResponse["templateProvenance"]> {
  if (payload === undefined || payload === null) {
    return {
      templateLabel: null,
      categoryLabels: [],
      source: null,
      applyMode: null,
    };
  }
  if (!isRecord(payload)) {
    throw new InvalidNotesResponseError("templateProvenance");
  }
  return {
    templateLabel: requireNullableString(payload.templateLabel, "templateProvenance.templateLabel"),
    categoryLabels: requireStringArray(
      payload.categoryLabels,
      "templateProvenance.categoryLabels",
    ).map((value) => requireTemplateCategory(value, "templateProvenance.categoryLabels")),
    source: requireTemplateSource(payload.source, "templateProvenance.source"),
    applyMode: requireTemplateApplyMode(payload.applyMode, "templateProvenance.applyMode"),
  };
}

function requireSuccessEnvelope(payload: unknown, field: string): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    throw new InvalidNotesResponseError(field);
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
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  return requestJson(response);
}

function normalizeProgressNoteResponse(payload: unknown): ProgressNoteResponse {
  if (!isRecord(payload)) {
    throw new InvalidNotesResponseError("note");
  }

  return {
    id: requireString(payload.id, "id"),
    patientId: requireString(payload.patientId, "patientId"),
    sessionId: requireString(payload.sessionId, "sessionId"),
    startedAt: requireString(payload.startedAt, "startedAt"),
    visitType: requireString(payload.visitType, "visitType"),
    noteStatus: requireNoteStatus(payload.noteStatus, "noteStatus"),
    patientSummary: requireNullableString(payload.patientSummary, "patientSummary"),
    sections: requireSoapSections(payload.sections),
    templateKey: requireTemplateKey(payload.templateKey, "templateKey"),
    templateProvenance: normalizeTemplateProvenance(payload.templateProvenance),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizeConditionTemplate(payload: unknown): ConditionTemplate {
  if (!isRecord(payload)) {
    throw new InvalidNotesResponseError("template");
  }

  const key = requireTemplateKey(payload.key, "key");
  if (key === null) {
    throw new InvalidNotesResponseError("key");
  }

  const categories = Array.isArray(payload.categories)
    ? payload.categories.map((value) => requireTemplateCategory(value, "categories"))
    : [requireTemplateCategory(payload.category, "category")];
  const source = payload.source === "custom" ? "custom" : "built_in";

  return {
    key,
    label: requireString(payload.label, "label"),
    category: requireTemplateCategory(payload.category, "category"),
    categories,
    source,
    description: requireString(payload.description, "description"),
    conditionTags: requireStringArray(payload.conditionTags, "conditionTags"),
    sections: requireSoapSections(payload.sections),
  };
}

function normalizeConditionTemplateListResponse(
  payload: unknown,
): ConditionTemplateListResponse {
  if (!isRecord(payload)) {
    throw new InvalidNotesResponseError("templates");
  }

  const templates = payload.templates;
  const suggestedTemplates = payload.suggestedTemplates;
  const recentTemplates = payload.recentTemplates;
  const categories = payload.categories;
  if (!Array.isArray(templates)) {
    throw new InvalidNotesResponseError("templates");
  }
  if (!Array.isArray(suggestedTemplates)) {
    throw new InvalidNotesResponseError("suggestedTemplates");
  }
  if (!Array.isArray(recentTemplates)) {
    throw new InvalidNotesResponseError("recentTemplates");
  }
  if (!Array.isArray(categories)) {
    throw new InvalidNotesResponseError("categories");
  }

  return {
    templates: templates.map(normalizeConditionTemplate),
    suggestedTemplates: suggestedTemplates.map(normalizeConditionTemplate),
    recentTemplates: recentTemplates.map(normalizeConditionTemplate),
    categories: categories.map((category) =>
      requireTemplateCategory(category, "categories"),
    ),
  };
}

function normalizeEnvelope<T>(
  payload: unknown,
  field: string,
  normalizer: (value: unknown) => T,
): T {
  return normalizer(requireSuccessEnvelope(payload, field));
}

function normalizeCustomTemplateCategory(payload: unknown): CustomTemplateCategoryDto {
  if (!isRecord(payload)) throw new InvalidNotesResponseError("category");
  return {
    id: requireString(payload.id, "id"),
    label: requireTemplateCategory(payload.label, "label"),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function normalizeCustomTemplate(payload: unknown): CustomTemplateDto {
  if (!isRecord(payload)) throw new InvalidNotesResponseError("template");
  const categories = payload.categories;
  if (!Array.isArray(categories)) throw new InvalidNotesResponseError("categories");
  return {
    id: requireString(payload.id, "id"),
    name: requireString(payload.name, "name"),
    source: "custom",
    categories: categories.map((value) => requireTemplateCategory(value, "categories")),
    sections: requireSoapSections(payload.sections),
    createdAt: requireString(payload.createdAt, "createdAt"),
    updatedAt: requireString(payload.updatedAt, "updatedAt"),
  };
}

function resolveDefaultBaseUrl(): string {
  return resolveApiBaseUrl();
}

function normalizeFilter(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed?.length ? trimmed : undefined;
}

function buildTemplatePath(filters: ConditionTemplateFilters = {}): string {
  const searchParams = new URLSearchParams();

  if (filters.category) {
    searchParams.set("category", filters.category);
  }

  const query = normalizeFilter(filters.query);
  if (query) {
    searchParams.set("query", query);
  }

  const patientId = normalizeFilter(filters.patientId);
  if (patientId) {
    searchParams.set("patientId", patientId);
  }

  if (typeof filters.limit === "number") {
    searchParams.set("limit", String(filters.limit));
  }

  const queryString = searchParams.toString();
  return queryString.length > 0
    ? `/api/v1/note-templates?${queryString}`
    : "/api/v1/note-templates";
}

export function createNotesApi(
  baseUrl: string = resolveDefaultBaseUrl(),
  transport: RequestTransport = fetch as unknown as RequestTransport,
) {
  return {
    async createManualNote(
      accessToken: string,
      patientId: string,
      input: CreateManualNoteRequest,
    ): Promise<ProgressNoteResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "POST",
        path: `/api/v1/patients/${patientId}/manual-notes`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "createManualNote", normalizeProgressNoteResponse);
    },

    async getManualNote(
      accessToken: string,
      patientId: string,
      sessionId: string,
    ): Promise<ProgressNoteResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "GET",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}/note`,
        accessToken,
      });

      return normalizeEnvelope(payload, "getManualNote", normalizeProgressNoteResponse);
    },

    async saveManualNote(
      accessToken: string,
      patientId: string,
      sessionId: string,
      input: SaveManualNoteRequest,
    ): Promise<ProgressNoteResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "PUT",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}/note`,
        accessToken,
        body: input,
      });

      return normalizeEnvelope(payload, "saveManualNote", normalizeProgressNoteResponse);
    },

    async finalizeManualNote(
      accessToken: string,
      patientId: string,
      sessionId: string,
    ): Promise<NoteLifecycleResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "POST",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}/note/finalize`,
        accessToken,
      });

      return normalizeEnvelope(payload, "finalizeManualNote", normalizeProgressNoteResponse);
    },

    async reopenManualNote(
      accessToken: string,
      patientId: string,
      sessionId: string,
    ): Promise<NoteLifecycleResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "POST",
        path: `/api/v1/patients/${patientId}/sessions/${sessionId}/note/reopen`,
        accessToken,
      });

      return normalizeEnvelope(payload, "reopenManualNote", normalizeProgressNoteResponse);
    },

    async listConditionTemplates(
      accessToken: string,
      filters: ConditionTemplateFilters = {},
    ): Promise<ConditionTemplateListResponse> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "GET",
        path: buildTemplatePath(filters),
        accessToken,
      });

      return normalizeEnvelope(
        payload,
        "listConditionTemplates",
        normalizeConditionTemplateListResponse,
      );
    },

    async listTemplateCategories(accessToken: string): Promise<CustomTemplateCategoryDto[]> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "GET",
        path: "/api/v1/template-categories",
        accessToken,
      });
      const data = requireSuccessEnvelope(payload, "listTemplateCategories");
      if (!Array.isArray(data)) throw new InvalidNotesResponseError("categories");
      return data.map(normalizeCustomTemplateCategory);
    },

    async createTemplateCategory(accessToken: string, label: TemplateCategory): Promise<CustomTemplateCategoryDto> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "POST",
        path: "/api/v1/template-categories",
        accessToken,
        body: { label },
      });
      return normalizeEnvelope(payload, "createTemplateCategory", normalizeCustomTemplateCategory);
    },

    async renameTemplateCategory(accessToken: string, categoryId: string, label: TemplateCategory): Promise<CustomTemplateCategoryDto> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "PATCH",
        path: `/api/v1/template-categories/${categoryId}`,
        accessToken,
        body: { label },
      });
      return normalizeEnvelope(payload, "renameTemplateCategory", normalizeCustomTemplateCategory);
    },

    async deleteTemplateCategory(accessToken: string, categoryId: string): Promise<void> {
      await requestProtectedJson(transport, baseUrl, {
        method: "DELETE",
        path: `/api/v1/template-categories/${categoryId}`,
        accessToken,
      });
    },

    async listCustomTemplates(accessToken: string, filters: ConditionTemplateFilters = {}): Promise<CustomTemplateDto[]> {
      const path = buildTemplatePath(filters).replace("/api/v1/note-templates", "/api/v1/custom-note-templates");
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "GET",
        path,
        accessToken,
      });
      const data = requireSuccessEnvelope(payload, "listCustomTemplates");
      if (!Array.isArray(data)) throw new InvalidNotesResponseError("templates");
      return data.map(normalizeCustomTemplate);
    },

    async createCustomTemplate(
      accessToken: string,
      input: Pick<CustomTemplateDto, "name" | "categories" | "sections">,
    ): Promise<CustomTemplateDto> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "POST",
        path: "/api/v1/custom-note-templates",
        accessToken,
        body: input,
      });
      return normalizeEnvelope(payload, "createCustomTemplate", normalizeCustomTemplate);
    },

    async updateCustomTemplate(
      accessToken: string,
      templateId: string,
      input: Partial<Pick<CustomTemplateDto, "name" | "categories" | "sections">>,
    ): Promise<CustomTemplateDto> {
      const payload = await requestProtectedJson(transport, baseUrl, {
        method: "PATCH",
        path: `/api/v1/custom-note-templates/${templateId}`,
        accessToken,
        body: input,
      });
      return normalizeEnvelope(payload, "updateCustomTemplate", normalizeCustomTemplate);
    },

    async deleteCustomTemplate(accessToken: string, templateId: string): Promise<void> {
      await requestProtectedJson(transport, baseUrl, {
        method: "DELETE",
        path: `/api/v1/custom-note-templates/${templateId}`,
        accessToken,
      });
    },
  };
}

export const notesApi = createNotesApi();
