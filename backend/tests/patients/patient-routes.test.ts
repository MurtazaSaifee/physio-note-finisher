import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import * as patientService from "../../src/domain/patients/patientService.js";
import { registerPatientRoutes } from "../../src/api/routes/patients.js";

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
  registerPatientRoutes(app);
  await app.ready();
  return app;
}

describe("patient routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("creates a patient for the authenticated clinic and returns success", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const createSpy = vi.spyOn(patientService, "createPatient").mockResolvedValue({
      id: "patient-1",
      clinicId: "clinic-1",
      fullName: "Ada Lovelace",
      dateOfBirth: "1990-01-23",
      sex: "female",
      phone: "555-0101",
      email: "ada@example.com",
      addressLine: "1 Circuit Lane",
      clinicalNotes: "Mobility follow-up",
      conditionTags: ["Mobility", "Strength"],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        fullName: "Ada Lovelace",
        phone: "555-0101",
        conditionTags: ["Mobility", "Strength"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "patient-1",
        clinicId: "clinic-1",
      }),
    });
    expect(createSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      input: expect.objectContaining({
        fullName: "Ada Lovelace",
        conditionTags: ["Mobility", "Strength"],
      }),
    });
  });

  it("returns active patient lists with query, limit, cursor, and includeArchived handling", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const listSpy = vi.spyOn(patientService, "listPatients").mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/patients?query=ada&limit=20&cursor=patient-0&includeArchived=false",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: {
        items: [],
        nextCursor: null,
      },
    });
    expect(listSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      query: "ada",
      includeArchived: false,
      limit: 20,
      cursor: "patient-0",
    });
  });

  it("returns same-clinic patient profiles and 404 for missing records", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const profileSpy = vi
      .spyOn(patientService, "getPatientProfile")
      .mockResolvedValue({
        id: "patient-1",
        fullName: "Ada Lovelace",
        dateOfBirth: "1990-01-23",
        sex: "female",
        phone: "555-0101",
        email: "ada@example.com",
        addressLine: "1 Circuit Lane",
        clinicalNotes: "Mobility follow-up",
        conditionTags: ["Mobility", "Strength"],
        lastVisitDate: "2026-04-20T12:00:00.000Z",
        unfinishedNoteCount: 1,
        recentSessionStatus: "draft",
        nextAppointment: null,
        archivedAt: null,
        createdAt: "2026-04-17T10:00:00.000Z",
        updatedAt: "2026-04-17T10:00:00.000Z",
      });

    const profileResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/patient-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(profileResponse.statusCode).toBe(200);
    expect(profileResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "patient-1",
        fullName: "Ada Lovelace",
      }),
    });
    expect(profileSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });

    profileSpy.mockRejectedValueOnce(new patientService.PatientNotFoundError());

    const notFoundResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients/missing-patient",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(notFoundResponse.statusCode).toBe(404);
  });

  it("edits patient records and toggles archive state without delete routes", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const updateSpy = vi.spyOn(patientService, "updatePatient").mockResolvedValue({
      id: "patient-1",
      clinicId: "clinic-1",
      fullName: "Ada Byron",
      dateOfBirth: "1990-01-23",
      sex: "female",
      phone: "555-0102",
      email: "ada@example.com",
      addressLine: "1 Circuit Lane",
      clinicalNotes: "Mobility follow-up",
      conditionTags: ["Mobility", "Strength"],
      lastVisitDate: "2026-04-20T12:00:00.000Z",
      unfinishedNoteCount: 1,
      recentSessionStatus: "draft",
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T11:00:00.000Z",
    });
    const archiveSpy = vi
      .spyOn(patientService, "setPatientArchived")
      .mockResolvedValue({
        id: "patient-1",
        clinicId: "clinic-1",
        fullName: "Ada Byron",
        dateOfBirth: "1990-01-23",
        sex: "female",
        phone: "555-0102",
        email: "ada@example.com",
        addressLine: "1 Circuit Lane",
        clinicalNotes: "Mobility follow-up",
        conditionTags: ["Mobility", "Strength"],
        lastVisitDate: "2026-04-20T12:00:00.000Z",
        unfinishedNoteCount: 1,
        recentSessionStatus: "draft",
        nextAppointment: null,
        archivedAt: "2026-04-17T12:00:00.000Z",
        createdAt: "2026-04-17T10:00:00.000Z",
        updatedAt: "2026-04-17T12:00:00.000Z",
      });

    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/patients/patient-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        fullName: "Ada Byron",
        phone: "555-0102",
      },
    });

    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json()).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(updateSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      input: expect.objectContaining({
        fullName: "Ada Byron",
      }),
    });

    const archiveResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/archive",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        archived: true,
      },
    });

    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json()).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(archiveSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      archived: true,
    });

    expect(
      app.hasRoute({
        method: "DELETE",
        url: "/api/v1/patients/patient-1",
      }),
    ).toBe(false);
  });

  it("returns 401 for invalid bearer tokens and 403 for clinic mismatches", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const missingAuthResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients",
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "GET",
      url: "/api/v1/patients?clinicId=clinic-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });
    expect(mismatchResponse.statusCode).toBe(403);
  });

  it("rejects invalid payloads with 400", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        phone: "555-0101",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid patient payload",
    });
  });

  it("rejects conditionTags payloads that exceed workspace bounds", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        fullName: "Ada Lovelace",
        conditionTags: [
          "Mobility",
          "Strength",
          "Balance",
          "Endurance",
          "Control",
          "Power",
          "Flexibility",
          "Range",
          "OverLimit",
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid patient payload",
    });
  });
});
