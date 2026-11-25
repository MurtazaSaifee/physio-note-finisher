import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerGoogleCalendarRoutes } from "../../src/api/routes/googleCalendar.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { prisma } from "../../src/data/prismaClient.js";
import { encryptToken, decryptToken } from "../../src/domain/google-calendar/tokenCipher.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
  process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY = "test-token-encryption-key";
  process.env.GOOGLE_CALENDAR_REDIRECT_URI = "https://api.test.com/auth/google/callback";
}

function createAccessToken(clinicId: string, userId = "user-1"): string {
  return issueTokenPair({
    sub: userId,
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

function mockGoogleApis(): {
  getTokenMock: ReturnType<typeof vi.fn>;
  setCredentialsMock: ReturnType<typeof vi.fn>;
  calendarListMock: ReturnType<typeof vi.fn>;
} {
  const getTokenMock = vi.fn();
  const setCredentialsMock = vi.fn();
  const calendarListMock = vi.fn();

  vi.doMock("googleapis", () => ({
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(function () { return ({
          generateAuthUrl: vi.fn().mockImplementation((options: any = {}) => {
            const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
            url.searchParams.set("client_id", "test-client-id");
            url.searchParams.set(
              "scope",
              Array.isArray(options.scope)
                ? options.scope.join(" ")
                : "https://www.googleapis.com/auth/calendar.events",
            );
            url.searchParams.set(
              "redirect_uri",
              "https://api.test.com/auth/google/callback",
            );
            if (options.state) {
              url.searchParams.set("state", options.state);
            }
            if (options.prompt) {
              url.searchParams.set("prompt", options.prompt);
            }
            if (options.access_type) {
              url.searchParams.set("access_type", options.access_type);
            }
            return url.toString();
          }),
          getToken: getTokenMock,
          setCredentials: setCredentialsMock,
        }); }),
      },
      calendar: vi.fn().mockImplementation(function () { return ({
        calendarList: {
          list: calendarListMock,
        },
      }); }),
    },
  }));

  return { getTokenMock, setCredentialsMock, calendarListMock };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock("googleapis");
});

describe("googleCalendarAuthService", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-17: buildGoogleConnectUrl generates an OAuth URL with calendar.events scope and state containing clinicId and userId", async () => {
    mockGoogleApis();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));

    try {
      const createSpy = vi.spyOn(prisma.googleCalendarOAuthState, "create").mockResolvedValue({
        id: "oauth-state-1",
        state: "state-1",
        userId: "user-1",
        clinicId: "clinic-1",
        expiresAt: new Date("2026-05-01T12:10:00Z"),
        createdAt: new Date("2026-05-01T12:00:00Z"),
        updatedAt: new Date("2026-05-01T12:00:00Z"),
      } as never);

      const {
        buildGoogleConnectUrl,
        issueGoogleCalendarOAuthState,
      } = await import("../../src/domain/google-calendar/googleCalendarAuthService.js");

      const state = await issueGoogleCalendarOAuthState("clinic-1", "user-1");
      const url = buildGoogleConnectUrl("clinic-1", "user-1", state);

      expect(url).toContain("accounts.google.com");
      expect(url).toContain("client_id=test-client-id");
      expect(url).toContain(encodeURIComponent("https://www.googleapis.com/auth/calendar.events"));
      expect(url).toContain("redirect_uri=" + encodeURIComponent("https://api.test.com/auth/google/callback"));
      expect(new URL(url).searchParams.get("state")).toBe(state);
      expect(createSpy).toHaveBeenCalledWith({
        data: expect.objectContaining({
          clinicId: "clinic-1",
          userId: "user-1",
          state,
          expiresAt: new Date("2026-05-01T12:10:00Z"),
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("D-17: consumeGoogleCalendarOAuthState accepts a valid state once and deletes it", async () => {
    mockGoogleApis();

    const deleteSpy = vi
      .spyOn(prisma.googleCalendarOAuthState, "delete")
      .mockResolvedValue({
        id: "oauth-state-1",
        state: "state-1",
        userId: "user-1",
        clinicId: "clinic-1",
        expiresAt: new Date("2026-05-01T12:10:00Z"),
        createdAt: new Date("2026-05-01T12:00:00Z"),
        updatedAt: new Date("2026-05-01T12:00:00Z"),
      } as never);

    vi.spyOn(prisma.googleCalendarOAuthState, "findFirst").mockResolvedValue({
      id: "oauth-state-1",
      state: "state-1",
      userId: "user-1",
      clinicId: "clinic-1",
      expiresAt: new Date("2026-05-01T12:10:00Z"),
      createdAt: new Date("2026-05-01T12:00:00Z"),
      updatedAt: new Date("2026-05-01T12:00:00Z"),
    } as never);

    const { consumeGoogleCalendarOAuthState } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    await consumeGoogleCalendarOAuthState("clinic-1", "user-1", "state-1");

    expect(deleteSpy).toHaveBeenCalledWith({
      where: { state: "state-1" },
    });
  });

  it("D-17: consumeGoogleCalendarOAuthState rejects an expired or unknown state", async () => {
    mockGoogleApis();

    vi.spyOn(prisma.googleCalendarOAuthState, "findFirst").mockResolvedValue(null);

    const { consumeGoogleCalendarOAuthState } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    await expect(
      consumeGoogleCalendarOAuthState("clinic-1", "user-1", "stale-state"),
    ).rejects.toThrow("Invalid or expired Google Calendar OAuth state");
  });

  it("D-17: consumeGoogleCalendarOAuthState rejects a state issued for a different clinic or user", async () => {
    mockGoogleApis();

    vi.spyOn(prisma.googleCalendarOAuthState, "findFirst").mockResolvedValue(null);

    const { consumeGoogleCalendarOAuthState } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    await expect(
      consumeGoogleCalendarOAuthState("clinic-2", "user-1", "state-1"),
    ).rejects.toThrow("Invalid or expired Google Calendar OAuth state");
    await expect(
      consumeGoogleCalendarOAuthState("clinic-1", "user-2", "state-1"),
    ).rejects.toThrow("Invalid or expired Google Calendar OAuth state");
  });

  it("D-17: exchangeGoogleCode exchanges the authorization code and persists an encrypted refresh token with account email", async () => {
    const { getTokenMock } = mockGoogleApis();
    getTokenMock.mockResolvedValue({
      tokens: {
        refresh_token: "test-refresh-token",
        access_token: "test-access-token",
      },
    });

    const upsertSpy = vi
      .spyOn(prisma.googleCalendarConnection, "upsert")
      .mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: "encrypted-token",
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

    const { exchangeGoogleCode } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    const result = await exchangeGoogleCode("clinic-1", "user-1", "auth-code-123");

    expect(getTokenMock).toHaveBeenCalledWith("auth-code-123");
    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
        create: expect.objectContaining({
          userId: "user-1",
          clinicId: "clinic-1",
          refreshToken: expect.any(String),
        }),
        update: expect.objectContaining({
          refreshToken: expect.any(String),
        }),
      }),
    );
    expect(result.connected).toBe(true);
  });

  it("D-28: disconnectGoogleCalendar removes the connection record but preserves local appointments", async () => {
    mockGoogleApis();

    const deleteSpy = vi
      .spyOn(prisma.googleCalendarConnection, "delete")
      .mockResolvedValue({ id: "conn-1" } as never);

    const appointmentFindSpy = vi
      .spyOn(prisma.appointment, "findMany")
      .mockResolvedValue([{ id: "appt-1" }] as never);

    const { disconnectGoogleCalendar } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    await disconnectGoogleCalendar("clinic-1", "user-1");

    expect(deleteSpy).toHaveBeenCalledWith({
      where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
    });
    expect(appointmentFindSpy).not.toHaveBeenCalled();
  });

  it("D-26: getGoogleCalendarConnectionStatus returns disconnected when no connection exists", async () => {
    mockGoogleApis();

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue(null);

    const { getGoogleCalendarConnectionStatus } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    const status = await getGoogleCalendarConnectionStatus("clinic-1", "user-1");

    expect(status.connected).toBe(false);
    expect(status.accountEmail).toBeNull();
    expect(status.syncState).toBe("disconnected");
  });

  it("D-26: getGoogleCalendarConnectionStatus returns connected with lastSyncedAt when connection exists", async () => {
    mockGoogleApis();

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: "encrypted-token",
      channelId: "channel-1",
      channelToken: "token-1",
      channelExpiration: new Date("2026-05-31T00:00:00Z"),
      nextSyncToken: "sync-token-1",
      lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { getGoogleCalendarConnectionStatus } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    const status = await getGoogleCalendarConnectionStatus("clinic-1", "user-1");

    expect(status.connected).toBe(true);
    expect(status.lastSyncedAt).toBe("2026-04-30T10:00:00.000Z");
    expect(status.syncState).toBe("connected");
  });

  it("D-26: getGoogleCalendarConnectionStatus returns needs_attention when lastSyncError is present", async () => {
    mockGoogleApis();

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: "encrypted-token",
      channelId: "channel-1",
      channelToken: "token-1",
      channelExpiration: new Date("2026-05-31T00:00:00Z"),
      nextSyncToken: "sync-token-1",
      lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
      lastSyncError: "Invalid credentials",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { getGoogleCalendarConnectionStatus } = await import(
      "../../src/domain/google-calendar/googleCalendarAuthService.js"
    );

    const status = await getGoogleCalendarConnectionStatus("clinic-1", "user-1");

    expect(status.syncState).toBe("needs_attention");
  });
});

describe("googleCalendar routes", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-17: POST /api/v1/google-calendar/exchange rejects remote payloads without state", async () => {
    const app = Fastify();
    registerGoogleCalendarRoutes(app);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/google-calendar/exchange",
      headers: {
        authorization: `Bearer ${createAccessToken("clinic-1")}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        code: "auth-code-123",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid payload" });
  });
});

describe("tokenCipher", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("T-08-05: encryptToken and decryptToken round-trip a refresh token without exposing plaintext", () => {
    const plaintext = "my-secret-refresh-token";
    const encrypted = encryptToken(plaintext);

    expect(encrypted).not.toBe(plaintext);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("T-08-05: decryptToken throws for tampered ciphertext", () => {
    expect(() => decryptToken("tampered:data")).toThrow();
  });
});

describe("googleCalendarClient", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-17: getGoogleCalendarClient decrypts the stored refresh token and returns an authenticated calendar client", async () => {
    const { setCredentialsMock } = mockGoogleApis();

    const encryptedRefreshToken = encryptToken("test-refresh-token");

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: encryptedRefreshToken,
      channelId: null,
      channelToken: null,
      channelExpiration: null,
      nextSyncToken: null,
      lastSyncedAt: null,
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { getGoogleCalendarClient } = await import(
      "../../src/domain/google-calendar/googleCalendarClient.js"
    );

    await getGoogleCalendarClient("clinic-1", "user-1");

    expect(setCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh_token: "test-refresh-token",
      }),
    );
  });
});
