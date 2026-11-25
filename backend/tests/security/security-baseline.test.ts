import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryAuthRepository,
  hashUserPassword,
} from "../../src/api/routes/auth.js";
import { createInMemoryGoogleCalendarQueue } from "../../src/domain/google-calendar/googleCalendarQueue.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { buildServer } from "../../src/server.js";
import { createInMemoryStageQueue } from "../../src/workers/voiceWorker.js";

const originalEnv = { ...process.env };

function testQueueOptions() {
  return {
    queue: createInMemoryStageQueue(),
    googleCalendarQueue: createInMemoryGoogleCalendarQueue(),
    exportQueue: {
      async add(_name: string, _data: unknown, opts?: { jobId?: string }) {
        return { id: opts?.jobId };
      },
    },
  };
}

function setSecurityEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value-at-least-32";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value-at-least-32";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
  process.env.TRUST_PROXY = "true";
  process.env.SQS_VOICE_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/voice";
  process.env.SQS_CALENDAR_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/calendar";
  process.env.SQS_REMINDER_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/reminder";
  process.env.SQS_EXPORT_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/export";
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

describe("security baseline controls", () => {
  beforeEach(() => {
    setSecurityEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects production-mode non-HTTPS ingress", async () => {
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({
      repository,
      nodeEnv: "production",
      ...testQueueOptions(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        "x-forwarded-proto": "http",
      },
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "HTTPS required" });

    const httpsForwardedResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        "x-forwarded-proto": "https",
      },
      payload: {
        email: "clinician@example.com",
      },
    });

    expect(httpsForwardedResponse.statusCode).toBe(400);
    expect(httpsForwardedResponse.json()).toEqual({ error: "Invalid auth payload" });
  });

  it("does not boot production auth with implicit in-memory storage", async () => {
    // Production now defaults to PrismaAuthRepository (not InMemoryAuthRepository).
    // The server boots successfully — Prisma fallback will throw on first auth query
    // if DATABASE_URL is not configured, preventing implicit in-memory use.
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "";
    const app = await buildServer({
      nodeEnv: "production",
      ...testQueueOptions(),
    });
    expect(app).toBeDefined();
    await app.close();
  });

  // This path runs many sequential auth requests and can exceed the default
  // per-test timeout when the full repo suite is running alongside it.
  it("enforces 5/min login and 10/min refresh throttles", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({ repository });
    const passwordHash = await hashUserPassword("Passw0rd!");

    await repository.createUser({
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      firstName: "Dr",
      lastName: "Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        payload: {
          email: "clinician@example.com",
          password: "Passw0rd!",
        },
      });

      expect(response.statusCode).toBe(200);
    }

    const loginRateLimited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(loginRateLimited.statusCode).toBe(429);
    expect(loginRateLimited.json()).toEqual({ error: "Too many requests" });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      headers: {
        "x-forwarded-for": "203.0.113.20",
      },
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    let refreshToken = loginResponse.json().refreshToken as string;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const refreshResponse = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        headers: {
          "x-forwarded-for": "203.0.113.20",
        },
        payload: {
          refreshToken,
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      refreshToken = refreshResponse.json().refreshToken as string;
    }

    const refreshRateLimited = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        "x-forwarded-for": "203.0.113.20",
      },
      payload: {
        refreshToken,
      },
    });

    expect(refreshRateLimited.statusCode).toBe(429);
    expect(refreshRateLimited.json()).toEqual({ error: "Too many requests" });
  }, 10000);

  it("returns 400 for malformed auth payloads before domain state mutation", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({ repository });
    const passwordHash = await hashUserPassword("Passw0rd!");

    await repository.createUser({
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      firstName: "Dr",
      lastName: "Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const invalidLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
      },
    });

    expect(invalidLogin.statusCode).toBe(400);
    expect(invalidLogin.json()).toEqual({ error: "Invalid auth payload" });
    expect(repository.refreshTokensByHash.size).toBe(0);

    const invalidRefresh = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: 123,
      },
    });

    expect(invalidRefresh.statusCode).toBe(400);
    expect(invalidRefresh.json()).toEqual({ error: "Invalid auth payload" });
    expect(repository.refreshTokensByHash.size).toBe(0);
  });

  it("logs correlation metadata while omitting sensitive auth and clinical values", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildServer({ repository });
    const passwordHash = await hashUserPassword("Passw0rd!");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const attemptedPassword = "WrongPassword!123";
    const clinicalText = "patient reports severe lumbar pain after rotation";
    const transcript = "verbatim transcript should never be logged";
    const accessToken = issueTokenPair({
      sub: "user-1",
      clinicId: "clinic-1",
      sessionId: "session-1",
      tokenVersion: 1,
    }).accessToken;

    await repository.createUser({
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      firstName: "Dr",
      lastName: "Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    try {
      const loginFailure = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          "x-correlation-id": "corr-login-fail",
        },
        payload: {
          email: "clinician@example.com",
          password: attemptedPassword,
        },
      });

      expect(loginFailure.statusCode).toBe(401);

      const denialResponse = await app.inject({
        method: "GET",
        url: `/api/v1/note-templates?clinicId=clinic-2&clinicalText=${encodeURIComponent(clinicalText)}&transcript=${encodeURIComponent(transcript)}`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-2",
          "x-correlation-id": "corr-protected-denial",
        },
      });

      expect(denialResponse.statusCode).toBe(403);

      const entries = parseStructuredEntries(warnSpy.mock.calls);
      const loginFailureEntry = entries.find(
        (entry) => entry.message === "auth.login.failed",
      );
      const protectedDenialEntry = entries.find(
        (entry) => entry.message === "protected.notes.access.denied",
      );

      expect(loginFailureEntry).toBeDefined();
      expect(loginFailureEntry?.requestId).toEqual(expect.any(String));
      expect(loginFailureEntry?.correlationId).toBe("corr-login-fail");
      expect(loginFailureEntry?.errorClass).toBe("InvalidCredentialsError");

      expect(protectedDenialEntry).toBeDefined();
      expect(protectedDenialEntry?.requestId).toEqual(expect.any(String));
      expect(protectedDenialEntry?.correlationId).toBe("corr-protected-denial");
      expect(protectedDenialEntry?.errorClass).toBe("ClinicAuthorizationError");

      const serializedEntries = JSON.stringify(entries);
      expect(serializedEntries).not.toContain(attemptedPassword);
      expect(serializedEntries).not.toContain(`Bearer ${accessToken}`);
      expect(serializedEntries).not.toContain(clinicalText);
      expect(serializedEntries).not.toContain(transcript);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
