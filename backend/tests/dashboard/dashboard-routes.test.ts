import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import * as dashboardService from "../../src/domain/dashboard/dashboardService.js";
import { registerDashboardRoutes } from "../../src/api/routes/dashboard.js";

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
  registerDashboardRoutes(app);
  await app.ready();
  return app;
}

describe("dashboard routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns 200 for authenticated requests", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const serviceSpy = vi
      .spyOn(dashboardService, "listDashboardSessions")
      .mockResolvedValue({
        upcoming: {
          label: "Upcoming",
          body: "Appointment details will appear here when calendar scheduling is available.",
        },
        recentSessions: [],
        filters: {
          date: "2026-04-26",
          patientId: "patient-1",
          noteStatus: "draft",
          search: "ada",
          page: 2,
          pageSize: 10,
        },
        page: 2,
        pageSize: 10,
        total: 12,
        totalPages: 2,
      });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/sessions?date=2026-04-26&patientId=patient-1&noteStatus=draft&search=ada&page=2&pageSize=10",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(serviceSpy).toHaveBeenCalledWith({
      clinicId: "clinic-1",
      filters: expect.objectContaining({
        date: "2026-04-26",
        patientId: "patient-1",
        noteStatus: "draft",
        search: "ada",
        page: 2,
        pageSize: 10,
      }),
    });
  });

  it("returns 400 for invalid noteStatus=bad query", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/sessions?noteStatus=bad",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for invalid pageSize query", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/sessions?pageSize=0",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 401 without bearer authentication", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/sessions",
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 403 for clinic mismatch", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/dashboard/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-2",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
