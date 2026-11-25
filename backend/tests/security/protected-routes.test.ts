import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import {
  createInMemoryAuthRepository,
  hashUserPassword,
} from "../../src/api/routes/auth.js";
import { buildServer } from "../../src/server.js";
import { registerAppointmentRoutes } from "../../src/api/routes/appointments.js";
import { registerNoteRoutes } from "../../src/api/routes/notes.js";
import { registerPatientRoutes } from "../../src/api/routes/patients.js";
import { registerSessionRoutes } from "../../src/api/routes/sessions.js";
import * as appointmentService from "../../src/domain/appointments/appointmentService.js";
import * as patientService from "../../src/domain/patients/patientService.js";
import * as sessionTimelineService from "../../src/domain/sessions/sessionTimelineService.js";

const originalEnv = { ...process.env };

const sensitiveRoutes = [
  { name: "patients", url: "/api/v1/patients" },
  { name: "sessions", url: "/api/v1/patients/patient-1/timeline" },
  { name: "notes", url: "/api/v1/note-templates" },
  { name: "appointments", url: "/api/v1/appointments" },
] as const;

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

async function buildProtectedRoutesApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const repository = createInMemoryAuthRepository();
  await repository.createUser({
    id: "user-1",
    clinicId: "clinic-1",
    email: "clinician@example.com",
    name: "Dr Physio",
    firstName: "Dr",
    lastName: "Physio",
    emailVerified: true,
    passwordHash: await hashUserPassword("Passw0rd!"),
    tokenVersion: 1,
  });
  app.decorate("authRepository", repository);

  registerPatientRoutes(app);
  registerSessionRoutes(app);
  registerNoteRoutes(app);
  registerAppointmentRoutes(app);

  await app.ready();
  return app;
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

function parseStructuredEntries(calls: unknown[][]): Array<Record<string, unknown>> {
  return calls.flatMap(([entry]) => {
    if (typeof entry !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(entry) as Record<string, unknown>;
      return [parsed];
    } catch {
      return [];
    }
  });
}

describe("authz matrix for sensitive routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns 401 for missing or invalid bearer tokens", async () => {
    const app = await buildProtectedRoutesApp();

    for (const route of sensitiveRoutes) {
      const missingTokenResponse = await app.inject({
        method: "GET",
        url: route.url,
      });
      expect(missingTokenResponse.statusCode).toBe(401);

      const invalidTokenResponse = await app.inject({
        method: "GET",
        url: route.url,
        headers: {
          authorization: "Bearer invalid-token",
        },
      });
      expect(invalidTokenResponse.statusCode).toBe(401);
    }
  });

  it("returns 403 for valid token with mismatched clinic context", async () => {
    const app = await buildProtectedRoutesApp();
    const accessToken = createAccessToken("clinic-1");

    for (const route of sensitiveRoutes) {
      const response = await app.inject({
        method: "GET",
        url: route.url,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-2",
        },
      });

      expect(response.statusCode).toBe(403);
    }
  });

  it("returns 403 when query clinicId mismatches even if header clinicId matches", async () => {
    const app = await buildProtectedRoutesApp();
    const accessToken = createAccessToken("clinic-1");

    for (const route of sensitiveRoutes) {
      const response = await app.inject({
        method: "GET",
        url: `${route.url}?clinicId=clinic-2`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
      });

      expect(response.statusCode).toBe(403);
    }
  });

  it("returns 200 when clinic context matches token clinicId", async () => {
    const app = await buildProtectedRoutesApp();
    const accessToken = createAccessToken("clinic-1");
    vi.spyOn(prisma.patient, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue({ id: "patient-1" } as never);
    vi.spyOn(prisma.session, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.appointment, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.progressNote, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.customTemplate, "findMany").mockResolvedValue([] as never);
    vi.spyOn(patientService, "listPatients").mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.spyOn(appointmentService, "listActiveAppointments").mockResolvedValue({
      appointments: [],
    });
    vi.spyOn(sessionTimelineService, "listPatientTimeline").mockResolvedValue({
      patientId: "patient-1",
      items: [],
    });

    for (const route of sensitiveRoutes) {
      const response = await app.inject({
        method: "GET",
        url: route.url,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
      });

      expect(response.statusCode).toBe(200);
    }
  });

  it("logs protected-route authorization denials with metadata and no clinical payload", async () => {
    const app = await buildProtectedRoutesApp();
    const accessToken = createAccessToken("clinic-1");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const correlationId = "corr-clinic-denial";
    const clinicalText = "patient reports severe lumbar pain after rotation";

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/note-templates?clinicId=clinic-2&clinicalText=${encodeURIComponent(clinicalText)}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-2",
          "x-correlation-id": correlationId,
        },
      });

      expect(response.statusCode).toBe(403);

      const entries = parseStructuredEntries(warnSpy.mock.calls);
      const denialEntry = entries.find(
        (entry) => entry.message === "protected.notes.access.denied",
      );

      expect(denialEntry).toBeDefined();
      expect(denialEntry?.requestId).toEqual(expect.any(String));
      expect(denialEntry?.correlationId).toBe(correlationId);
      expect(denialEntry?.errorClass).toBe("ClinicAuthorizationError");
      expect(JSON.stringify(entries)).not.toContain(clinicalText);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("rejects stale access tokens on protected routes with an injected repository", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({ repository });

    try {
      await repository.createUser({
        id: "user-1",
        clinicId: "clinic-1",
        email: "clinician@example.com",
        name: "Dr Physio",
        firstName: "Dr",
        lastName: "Physio",
        emailVerified: true,
        passwordHash: await hashUserPassword("Passw0rd!"),
        tokenVersion: 0,
      });

      const loginResponse = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "clinician@example.com",
          password: "Passw0rd!",
        },
      });
      expect(loginResponse.statusCode).toBe(200);
      const staleAccessToken = loginResponse.json().accessToken as string;

      const user = await repository.findUserByEmail("clinician@example.com");
      expect(user).toBeDefined();
      user!.tokenVersion += 1;
      await repository.saveUser(user!);

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/patients",
        headers: {
          authorization: `Bearer ${staleAccessToken}`,
          "x-clinic-id": "clinic-1",
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("rejects pre-existing unverified access tokens with an injected repository", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({ repository });
    vi.spyOn(prisma.patient, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue({ id: "patient-1" } as never);
    vi.spyOn(prisma.session, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.appointment, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.progressNote, "findMany").mockResolvedValue([] as never);
    vi.spyOn(prisma.customTemplate, "findMany").mockResolvedValue([] as never);
    vi.spyOn(patientService, "listPatients").mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    try {
      await repository.createUser({
        id: "user-unverified",
        clinicId: "clinic-1",
        email: "unverified@example.com",
        name: "Unverified Clinician",
        firstName: "Unverified",
        lastName: "Clinician",
        emailVerified: false,
        passwordHash: await hashUserPassword("Passw0rd!"),
        tokenVersion: 0,
      });

      const unverifiedAccessToken = issueTokenPair({
        sub: "user-unverified",
        clinicId: "clinic-1",
        sessionId: "session-unverified",
        tokenVersion: 0,
      }).accessToken;

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/patients",
        headers: {
          authorization: `Bearer ${unverifiedAccessToken}`,
          "x-clinic-id": "clinic-1",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "email_verification_required",
        email: "unverified@example.com",
        otpRequired: true,
      });
    } finally {
      await app.close();
    }
  });
});
