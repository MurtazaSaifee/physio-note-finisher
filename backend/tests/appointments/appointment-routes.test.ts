import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import * as appointmentService from "../../src/domain/appointments/appointmentService.js";
import { registerAppointmentRoutes } from "../../src/api/routes/appointments.js";

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
  registerAppointmentRoutes(app);
  await app.ready();
  return app;
}

const baseAppointmentResponse = {
  id: "appt-1",
  clinicId: "clinic-1",
  patientId: "patient-1",
  patientName: "Ada Lovelace",
  scheduledAt: "2026-05-01T09:00:00.000Z",
  durationMinutes: 30,
  status: "upcoming" as const,
  linkedSessionId: null,
  reminderText: "You have an appointment with Ada Lovelace on May 1, 2026 at 9:00 AM.",
  notes: null,
  syncStatus: "manual" as const,
  syncedAt: null,
  googleEventId: null,
  createdAt: "2026-04-30T10:00:00.000Z",
  updatedAt: "2026-04-30T10:00:00.000Z",
};

describe("appointment routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("creates an appointment for the authenticated clinic and returns 201", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const createSpy = vi
      .spyOn(appointmentService, "createAppointment")
      .mockResolvedValue(baseAppointmentResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        patientId: "patient-1",
        scheduledAt: "2026-05-01T09:00:00.000Z",
        durationMinutes: 30,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "appt-1",
        clinicId: "clinic-1",
        status: "upcoming",
      }),
    });
    expect(createSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      input: expect.objectContaining({
        patientId: "patient-1",
        scheduledAt: "2026-05-01T09:00:00.000Z",
        durationMinutes: 30,
      }),
    });
  });

  it("returns active appointments for the authenticated clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const listSpy = vi
      .spyOn(appointmentService, "listActiveAppointments")
      .mockResolvedValue([baseAppointmentResponse]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/appointments?date=2026-05-01",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: [expect.objectContaining({ id: "appt-1", status: "upcoming" })],
    });
    expect(listSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      date: "2026-05-01",
    });
  });

  it("returns appointment detail for same-clinic records", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const detailSpy = vi
      .spyOn(appointmentService, "getAppointmentDetail")
      .mockResolvedValue(baseAppointmentResponse);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/appointments/appt-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        id: "appt-1",
        patientName: "Ada Lovelace",
      }),
    });
    expect(detailSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
    });

    detailSpy.mockRejectedValueOnce(
      new appointmentService.AppointmentNotFoundError(),
    );

    const notFoundResponse = await app.inject({
      method: "GET",
      url: "/api/v1/appointments/missing-appt",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(notFoundResponse.statusCode).toBe(404);
  });

  it("updates an appointment within the authenticated clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const updateSpy = vi
      .spyOn(appointmentService, "updateAppointment")
      .mockResolvedValue({
        ...baseAppointmentResponse,
        durationMinutes: 60,
        notes: "Updated notes",
        updatedAt: "2026-04-30T11:00:00.000Z",
      });

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/appointments/appt-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        durationMinutes: 60,
        notes: "Updated notes",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(updateSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      input: expect.objectContaining({
        durationMinutes: 60,
        notes: "Updated notes",
      }),
    });
  });

  it("cancels an appointment within the authenticated clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const cancelSpy = vi
      .spyOn(appointmentService, "cancelAppointment")
      .mockResolvedValue({
        ...baseAppointmentResponse,
        status: "cancelled",
        updatedAt: "2026-04-30T12:00:00.000Z",
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/appointments/appt-1/cancel",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        success: true,
      }),
    );
    expect(cancelSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
    });
  });

  it("returns appointment history with cancelled and missed statuses", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const historySpy = vi
      .spyOn(appointmentService, "getAppointmentHistory")
      .mockResolvedValue([
        {
          ...baseAppointmentResponse,
          id: "appt-3",
          status: "cancelled",
          scheduledAt: "2026-04-25T09:00:00.000Z",
        },
      ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/appointments/history?limit=20",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: "appt-3",
          status: "cancelled",
        }),
      ],
    });
    expect(historySpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      limit: 20,
    });
  });

  it("returns 401 for invalid bearer tokens and 403 for clinic mismatches", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const missingAuthResponse = await app.inject({
      method: "GET",
      url: "/api/v1/appointments",
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "GET",
      url: "/api/v1/appointments?clinicId=clinic-2",
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
      url: "/api/v1/appointments",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        durationMinutes: 30,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid appointment payload",
    });
  });

  it("rejects appointment-level template fields with 400", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/appointments",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        patientId: "patient-1",
        scheduledAt: "2026-05-01T09:00:00.000Z",
        durationMinutes: 30,
        templateKey: "should-not-be-allowed",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "Invalid appointment payload",
    });
  });
});
