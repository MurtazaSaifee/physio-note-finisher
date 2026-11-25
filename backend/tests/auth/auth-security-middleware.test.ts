import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthTestApp,
  createInMemoryAuthRepository,
  hashUserPassword,
} from "../../src/api/routes/auth.js";
import { createInMemoryGoogleCalendarQueue } from "../../src/domain/google-calendar/googleCalendarQueue.js";
import { createInMemoryStageQueue } from "../../src/workers/voiceWorker.js";
import { buildServer } from "../../src/server.js";

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

function setAuthEnv(overrides: Record<string, string> = {}): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value-at-least-32";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value-at-least-32";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "1";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "1";
  process.env.SQS_VOICE_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/voice";
  process.env.SQS_CALENDAR_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/calendar";
  process.env.SQS_REMINDER_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/reminder";
  process.env.SQS_EXPORT_QUEUE_URL = "https://sqs.ap-south-1.amazonaws.com/123/export";

  Object.assign(process.env, overrides);
}

describe("HTTPS gate and rate limit middleware", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("HTTPS gate blocks production-mode non-HTTPS ingress before route handler execution", async () => {
    process.env.APP_ENV = "production";
    process.env.NODE_ENV = "production";
    const repository = createInMemoryAuthRepository();
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const app = await buildServer({
      repository,
      nodeEnv: "production",
      ...testQueueOptions(),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "HTTPS required" });
    expect(repository.refreshTokensByHash.size).toBe(0);
  });

  it("rate limit: login endpoint returns 429 after limit is exceeded", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(secondResponse.json()).toEqual({ error: "Too many requests" });
  });

  it("rate limit: refresh endpoint returns 429 after limit is exceeded", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    const firstRefreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: loginResponse.json().refreshToken as string,
      },
    });

    const secondRefreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: firstRefreshResponse.json().refreshToken as string,
      },
    });

    expect(firstRefreshResponse.statusCode).toBe(200);
    expect(secondRefreshResponse.statusCode).toBe(429);
    expect(secondRefreshResponse.json()).toEqual({ error: "Too many requests" });
  });

  it("rate limit cleanup timers are cleared when the auth app closes", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const repository = createInMemoryAuthRepository();

    try {
      const app = await buildAuthTestApp(repository);

      expect(setIntervalSpy).toHaveBeenCalledTimes(9);

      await app.close();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(9);
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });

  it("invalid login payload returns 400 before domain auth logic executes", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid auth payload" });
    expect(repository.refreshTokensByHash.size).toBe(0);
  });

  it("invalid refresh payload returns 400 before token service execution", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });
    repository.usersById.set("user-1", repository.usersByEmail.get("clinician@example.com")!);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: 123,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid auth payload" });
    expect(repository.refreshTokensByHash.size).toBe(0);
  });
});
