import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import * as sessionTimelineService from "../../src/domain/sessions/sessionTimelineService.js";
import { registerSessionRoutes } from "../../src/api/routes/sessions.js";

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
  registerSessionRoutes(app);
  await app.ready();
  return app;
}

describe("session timeline routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("stores a session entry for the authenticated clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const createSpy = vi
      .spyOn(sessionTimelineService, "createSessionEntry")
      .mockResolvedValue({
        id: "session-1",
        patientId: "patient-1",
        sessionDate: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "draft",
        finalNote: null,
        patientSummary: null,
        priorPlan: null,
        carryForwardContext: null,
        createdAt: "2026-04-17T12:34:56.000Z",
        updatedAt: "2026-04-17T12:34:56.000Z",
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "draft",
        finalNote: "Visit note",
        patientSummary: "Summary",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "session-1",
        patientId: "patient-1",
      }),
    });
    expect(createSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      input: expect.objectContaining({
        noteStatus: "draft",
      }),
    });
  });

  it("returns patient timeline ordered by startedAt descending", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const listSpy = vi
      .spyOn(sessionTimelineService, "listPatientTimeline")
      .mockResolvedValue({
        patientId: "patient-1",
        items: [
          {
            id: "session-2",
            patientId: "patient-1",
            sessionDate: "2026-04-18T12:34:56.000Z",
            visitType: "follow-up",
            noteStatus: "finalized",
            finalNotePreview: "short note",
            patientSummaryPreview: "summary",
          },
          {
            id: "session-1",
            patientId: "patient-1",
            sessionDate: "2026-04-17T12:34:56.000Z",
            visitType: "initial",
            noteStatus: "draft",
            finalNotePreview: null,
            patientSummaryPreview: null,
          },
        ],
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/timeline",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        items: expect.arrayContaining([
          expect.objectContaining({
            sessionDate: "2026-04-18T12:34:56.000Z",
            noteStatus: "finalized",
          }),
        ]),
        patientId: "patient-1",
      },
    });
    expect(listSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });
  });

  it("returns prior-session detail data and 404 for missing records", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const detailSpy = vi
      .spyOn(sessionTimelineService, "getPriorSessionDetail")
      .mockResolvedValue({
        id: "session-1",
        patientId: "patient-1",
        sessionDate: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "finalized",
        finalNote: "Full note",
        patientSummary: "Summary",
        priorPlan: "Plan",
        carryForwardContext: "Context",
        createdAt: "2026-04-17T12:40:00.000Z",
        updatedAt: "2026-04-17T12:40:00.000Z",
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/session-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "session-1",
        finalNote: "Full note",
      }),
    });
    expect(detailSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
    });

    detailSpy.mockRejectedValueOnce(
      new sessionTimelineService.SessionNotFoundError(),
    );

    const notFoundResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/sessions/missing-session",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(notFoundResponse.statusCode).toBe(404);
  });

  it("returns 401 for missing tokens and 403 for clinic mismatches", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const missingAuthResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/timeline",
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1/timeline?clinicId=clinic-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(mismatchResponse.statusCode).toBe(403);
  });

  it("rejects invalid session payloads with 400", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        startedAt: "invalid-date",
        visitType: "follow-up",
        noteStatus: "draft",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid session payload",
    });
  });
});
