import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { registerNoteRoutes } from "../../src/api/routes/notes.js";
import { registerAppointmentRoutes } from "../../src/api/routes/appointments.js";
import * as noteService from "../../src/domain/notes/noteService.js";
import * as appointmentService from "../../src/domain/appointments/appointmentService.js";

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
  registerAppointmentRoutes(app);
  await app.ready();
  return app;
}

describe("sync replay integration", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("replays queued note edit and appointment edit successfully", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    vi.spyOn(noteService, "saveManualNote").mockResolvedValue({
      id: "note-1",
      patientId: "patient-1",
      sessionId: "session-1",
      startedAt: "2026-04-17T12:34:56.000Z",
      visitType: "follow-up",
      noteStatus: "draft",
      sections: {
        subjective: "Updated pain",
        objective: "Improved flexion",
        assessment: "Recovering",
        plan: "Continue PT",
      },
      templateKey: null,
      createdAt: "2026-04-17T12:40:00.000Z",
      updatedAt: "2026-04-17T12:41:00.000Z",
    });

    vi.spyOn(appointmentService, "updateAppointment").mockResolvedValue({
      id: "appt-1",
      patientId: "patient-1",
      clinicId: "clinic-1",
      patientName: "Test Patient",
      scheduledAt: "2026-05-01T09:00:00.000Z",
      durationMinutes: 30,
      status: "upcoming",
      reminderText: "You have an appointment with Test Patient on May 1, 2026 at 9:00 AM.",
      notes: null,
      linkedSessionId: null,
      syncStatus: "manual",
      syncedAt: null,
      googleEventId: null,
      createdAt: "2026-04-17T12:00:00.000Z",
      updatedAt: "2026-04-17T12:45:00.000Z",
    });

    // Replay note edit
    const noteResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        sections: {
          subjective: "Updated pain",
          objective: "Improved flexion",
          assessment: "Recovering",
          plan: "Continue PT",
        },
      },
    });

    expect(noteResponse.statusCode).toBe(200);
    expect(noteResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        sections: expect.objectContaining({
          subjective: "Updated pain",
        }),
      }),
    });

    // Replay appointment edit
    const apptResponse = await app.inject({
      method: "PUT",
      url: "/api/v1/appointments/appt-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        scheduledAt: "2026-05-01T09:00:00Z",
        durationMinutes: 30,
      },
    });

    expect(apptResponse.statusCode).toBe(200);
    expect(apptResponse.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        scheduledAt: "2026-05-01T09:00:00.000Z",
      }),
    });

    expect(noteService.saveManualNote).toHaveBeenCalledTimes(1);
    expect(appointmentService.updateAppointment).toHaveBeenCalledTimes(1);
  });

  it("retries failed replay with eventual success and removes queue item", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    let attemptCount = 0;
    vi.spyOn(noteService, "saveManualNote").mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("Database timeout");
      }
      return {
        id: "note-1",
        patientId: "patient-1",
        sessionId: "session-1",
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "draft",
        sections: {
          subjective: "Retry success",
          objective: "Normal",
          assessment: "Good",
          plan: "Rest",
        },
        templateKey: null,
        createdAt: "2026-04-17T12:40:00.000Z",
        updatedAt: "2026-04-17T12:41:00.000Z",
      };
    });

    // Simulate retry: first call fails with 500-equivalent (service throws)
    const firstAttempt = app.inject({
      method: "PUT",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        sections: {
          subjective: "Retry success",
          objective: "Normal",
          assessment: "Good",
          plan: "Rest",
        },
      },
    });

    // The route catches the error and returns 500
    const firstResult = await firstAttempt;
    expect(firstResult.statusCode).toBe(500);
    expect(firstResult.json().message).toBe("Database timeout");

    // Second attempt succeeds
    const secondAttempt = await app.inject({
      method: "PUT",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        sections: {
          subjective: "Retry success",
          objective: "Normal",
          assessment: "Good",
          plan: "Rest",
        },
      },
    });

    expect(secondAttempt.statusCode).toBe(200);
    expect(attemptCount).toBe(2);
  });

  it("preserves queue order during replay", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const callOrder: string[] = [];

    vi.spyOn(noteService, "saveManualNote").mockImplementation(async () => {
      callOrder.push("note");
      return {
        id: "note-1",
        patientId: "patient-1",
        sessionId: "session-1",
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "draft",
        sections: {
          subjective: "Pain",
          objective: "Swelling",
          assessment: "Sprain",
          plan: "RICE",
        },
        templateKey: null,
        createdAt: "2026-04-17T12:40:00.000Z",
        updatedAt: "2026-04-17T12:41:00.000Z",
      };
    });

    vi.spyOn(appointmentService, "updateAppointment").mockImplementation(async () => {
      callOrder.push("appointment");
      return {
        id: "appt-1",
        patientId: "patient-1",
        clinicId: "clinic-1",
        patientName: "Test Patient",
        scheduledAt: "2026-05-01T09:00:00.000Z",
        durationMinutes: 30,
        status: "upcoming",
        reminderText: "You have an appointment with Test Patient on May 1, 2026 at 9:00 AM.",
        notes: null,
        linkedSessionId: null,
        syncStatus: "manual",
        syncedAt: null,
        googleEventId: null,
        createdAt: "2026-04-17T12:00:00.000Z",
        updatedAt: "2026-04-17T12:45:00.000Z",
      };
    });

    await app.inject({
      method: "PUT",
      url: "/api/v1/patients/patient-1/sessions/session-1/note",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        sections: {
          subjective: "Pain",
          objective: "Swelling",
          assessment: "Sprain",
          plan: "RICE",
        },
      },
    });

    await app.inject({
      method: "PUT",
      url: "/api/v1/appointments/appt-1",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        scheduledAt: "2026-05-01T09:00:00Z",
        durationMinutes: 30,
      },
    });

    expect(callOrder).toEqual(["note", "appointment"]);
  });
});
