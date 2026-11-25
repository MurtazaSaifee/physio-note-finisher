import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { prisma } from "../../src/data/prismaClient.js";
import * as copyForwardService from "../../src/domain/sessions/copyForwardService.js";
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

describe("copy-forward session routes and service", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns a scoped scaffold without mutating the source session", async () => {
    const sourceRow = {
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      startedAt: new Date("2026-04-17T12:34:56.000Z"),
      priorPlan: "prior plan text",
      carryForwardContext: "carry forward context",
      createdAt: new Date("2026-04-17T12:40:00.000Z"),
      updatedAt: new Date("2026-04-17T12:40:00.000Z"),
    };

    const findFirstSpy = vi
      .spyOn(prisma.session, "findFirst")
      .mockResolvedValue(sourceRow as never);
    const createSpy = vi.spyOn(prisma.session, "create");
    const updateSpy = vi.spyOn(prisma.session, "update");

    const result = await copyForwardService.copyForwardFromSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        id: "session-1",
      },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        startedAt: true,
        priorPlan: true,
        carryForwardContext: true,
      },
    });
    expect(result).toEqual({
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
      priorPlan: "prior plan text",
      carryForwardContext: null,
      sourceSessionDate: "2026-04-17T12:34:56.000Z",
    });
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns a scaffold from the protected route and rejects invalid selections", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const scaffoldSpy = vi
      .spyOn(copyForwardService, "copyForwardFromSession")
      .mockResolvedValue({
        patientId: "patient-1",
        sourceSessionId: "session-1",
        selectedSections: ["priorPlan", "carryForwardContext"],
        priorPlan: "prior plan text",
        carryForwardContext: "carry forward context",
        sourceSessionDate: "2026-04-17T12:34:56.000Z",
      });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/copy-forward",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        selectedSections: ["priorPlan"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        patientId: "patient-1",
        sourceSessionId: "session-1",
      }),
    });
    expect(scaffoldSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
    });

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/copy-forward",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        selectedSections: [],
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toEqual({
      error: "Invalid session payload",
    });
  });

  it("returns 401, 403, and 404 for protected source-session access", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    vi.spyOn(copyForwardService, "copyForwardFromSession").mockRejectedValueOnce(
      new copyForwardService.SessionNotFoundError(),
    );

    const missingAuthResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/copy-forward",
      payload: {
        selectedSections: ["carryForwardContext"],
      },
    });
    expect(missingAuthResponse.statusCode).toBe(401);

    const mismatchResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/copy-forward?clinicId=clinic-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        selectedSections: ["carryForwardContext"],
      },
    });
    expect(mismatchResponse.statusCode).toBe(403);

    const notFoundResponse = await app.inject({
      method: "POST",
      url: "/api/v1/patients/patient-1/sessions/session-1/copy-forward",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        selectedSections: ["carryForwardContext"],
      },
    });
    expect(notFoundResponse.statusCode).toBe(404);
  });
});
