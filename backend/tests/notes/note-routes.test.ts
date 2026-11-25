import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import * as conditionTemplatesModule from "../../src/domain/notes/conditionTemplates.js";
import * as noteService from "../../src/domain/notes/noteService.js";
import * as templateService from "../../src/domain/notes/templateService.js";
import { registerNoteRoutes } from "../../src/api/routes/notes.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerNoteRoutes(app);
  await app.ready();
  return app;
}

describe("note routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("creates, reads, saves, finalizes, and reopens manual notes for the authenticated clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    vi.spyOn(noteService, "createManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "draft",
      patientSummary: null,
      sections: {
        subjective: "Pain with stairs",
        objective: "Mild swelling",
        assessment: "Improving strength",
        plan: "Continue progressive loading",
      },
      templateKey: "knee",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:40:00.000Z",
    });
    vi.spyOn(noteService, "getManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "draft",
      patientSummary: "Continue the agreed home exercise plan.",
      sections: {
        subjective: "Pain with stairs",
        objective: "Mild swelling",
        assessment: "Improving strength",
        plan: "Continue progressive loading",
      },
      templateKey: "knee",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:40:00.000Z",
    });
    vi.spyOn(noteService, "saveManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "draft",
      patientSummary: null,
      sections: {
        subjective: "Pain with stairs",
        objective: "Improved knee extension",
        assessment: "Improving strength",
        plan: "Continue progressive loading",
      },
      templateKey: "knee",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:41:00.000Z",
    });
    vi.spyOn(noteService, "finalizeManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "finalized",
      patientSummary: null,
      sections: {
        subjective: "Pain with stairs",
        objective: "Improved knee extension",
        assessment: "Improving strength",
        plan: "Continue progressive loading",
      },
      templateKey: "knee",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:42:00.000Z",
    });
    vi.spyOn(noteService, "reopenManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "reopened",
      patientSummary: null,
      sections: {
        subjective: "Pain with stairs",
        objective: "Improved knee extension",
        assessment: "Improving strength",
        plan: "Continue progressive loading",
      },
      templateKey: "knee",
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:43:00.000Z",
    });

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/manual-notes",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        sections: {
          subjective: null,
          objective: null,
          assessment: null,
          plan: null,
        },
        templateKey: "knee",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        noteStatus: "draft",
        sections: expect.objectContaining({
          subjective: "Pain with stairs",
        }),
      }),
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        sessionId: "session-1",
        patientSummary: "Continue the agreed home exercise plan.",
      }),
    });

    const saveResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        sections: {
          subjective: null,
          objective: null,
          assessment: null,
          plan: null,
        },
        templateKey: "knee",
      },
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        sections: expect.objectContaining({
          objective: "Improved knee extension",
        }),
      }),
    });

    const finalizeResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/note/finalize",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(finalizeResponse.statusCode).toBe(200);
    expect(finalizeResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        noteStatus: "finalized",
      }),
    });

    const reopenResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/note/reopen",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(reopenResponse.statusCode).toBe(200);
    expect(reopenResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        noteStatus: "reopened",
      }),
    });
  });

  it("returns 401, 403, 400, 404, and 409 for protected note failures", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    vi.spyOn(noteService, "createManualNote").mockRejectedValue(
      new noteService.NoteFinalizedError(),
    );
    vi.spyOn(noteService, "getManualNote").mockRejectedValue(
      new noteService.NoteNotFoundError(),
    );

    const missingAuthResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/manual-notes?clinicId=clinic-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        sections: {
          subjective: "Pain",
          objective: "Mild swelling",
          assessment: "Improving strength",
          plan: "Continue loading",
        },
      },
    });
    expect(mismatchResponse.statusCode).toBe(403);

    const invalidPayloadResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/manual-notes",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "invalid-date",
        visitType: "follow-up",
        sections: {
          subjective: "Pain",
          objective: "Mild swelling",
          assessment: "Improving strength",
          plan: "Continue loading",
        },
        noteStatus: "draft",
      },
    });
    expect(invalidPayloadResponse.statusCode).toBe(400);
    expect(invalidPayloadResponse.json()).toEqual({
      error: "Invalid note payload",
    });

    const noteMissingResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });
    expect(noteMissingResponse.statusCode).toBe(404);
    expect(noteMissingResponse.json()).toEqual({
      error: "Note not found",
    });

    const finalizedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/manual-notes",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        sections: {
          subjective: "Pain",
          objective: "Mild swelling",
          assessment: "Improving strength",
          plan: "Continue loading",
        },
      },
    });
    expect(finalizedResponse.statusCode).toBe(409);
    expect(finalizedResponse.json()).toEqual({
      error: "Note already finalized",
    });
  });

  it("lists starter templates through the existing note auth guard", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const listSpy = vi.spyOn(
      conditionTemplatesModule,
      "listConditionTemplates",
    ).mockResolvedValue({
      templates: [
        {
          key: "knee",
          label: "Knee pain",
          category: "Knee",
          description: "Knee scaffold",
          conditionTags: ["Knee"],
          sections: {
            subjective: "Subjective scaffold",
            objective: "Objective scaffold",
            assessment: "Assessment scaffold",
            plan: "Plan scaffold",
          },
        },
      ],
      suggestedTemplates: [],
      recentTemplates: [],
      categories: ["Knee"],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/note-templates",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        templates: [
          expect.objectContaining({
            key: "knee",
            sections: expect.objectContaining({
              subjective: "Subjective scaffold",
            }),
          }),
        ],
        suggestedTemplates: [],
        recentTemplates: [],
        categories: ["Knee"],
      },
    });
    expect(listSpy).toHaveBeenCalledTimes(1);

    const missingAuthResponse = await app.inject({
      method: "GET",
      url: "/api/v1/note-templates",
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "GET",
      url: "/api/v1/note-templates?clinicId=clinic-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });
    expect(mismatchResponse.statusCode).toBe(403);
  });

  it("supports owner-scoped template category and custom template CRUD routes", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    vi.spyOn(templateService, "listTemplateCategories").mockResolvedValue([]);
    vi.spyOn(templateService, "createTemplateCategory").mockResolvedValue({
      id: "cat-1",
      label: "Knee",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });
    vi.spyOn(templateService, "renameTemplateCategory").mockResolvedValue({
      id: "cat-1",
      label: "General",
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:01:00.000Z",
    });
    vi.spyOn(templateService, "deleteTemplateCategory").mockResolvedValue();
    vi.spyOn(templateService, "listCustomTemplates").mockResolvedValue([]);
    vi.spyOn(templateService, "createCustomTemplate").mockResolvedValue({
      id: "tmp-1",
      name: "Knee boost",
      source: "custom",
      categories: ["Knee"],
      sections: { subjective: "x", objective: null, assessment: null, plan: null },
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });
    vi.spyOn(templateService, "updateCustomTemplate").mockResolvedValue({
      id: "tmp-1",
      name: "Knee boost v2",
      source: "custom",
      categories: ["General"],
      sections: { subjective: "x", objective: "y", assessment: null, plan: null },
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:02:00.000Z",
    });
    vi.spyOn(templateService, "deleteCustomTemplate").mockResolvedValue();

    const createCategory = await app.inject({
      method: "POST",
      url: "/api/v1/template-categories",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: { label: "Knee" },
    });
    expect(createCategory.statusCode).toBe(201);

    const renameCategory = await app.inject({
      method: "PATCH",
      url: "/api/v1/template-categories/cat-1",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: { label: "General" },
    });
    expect(renameCategory.statusCode).toBe(200);

    const deleteCategory = await app.inject({
      method: "DELETE",
      url: "/api/v1/template-categories/cat-1",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
    });
    expect(deleteCategory.statusCode).toBe(204);

    const createTemplate = await app.inject({
      method: "POST",
      url: "/api/v1/custom-note-templates",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: {
        name: "Knee boost",
        categories: ["Knee"],
        sections: { subjective: "x", objective: "", assessment: "", plan: "" },
      },
    });
    expect(createTemplate.statusCode).toBe(201);

    const updateTemplate = await app.inject({
      method: "PATCH",
      url: "/api/v1/custom-note-templates/tmp-1",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: { name: "Knee boost v2" },
    });
    expect(updateTemplate.statusCode).toBe(200);

    const deleteTemplate = await app.inject({
      method: "DELETE",
      url: "/api/v1/custom-note-templates/tmp-1",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
    });
    expect(deleteTemplate.statusCode).toBe(204);
  });
});
