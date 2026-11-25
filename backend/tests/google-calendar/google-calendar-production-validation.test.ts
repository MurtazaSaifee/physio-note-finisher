import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function getEncryptedToken(plaintext: string): string {
  return encryptToken(plaintext);
}

function mockGoogleApis(options: {
  eventsListResponse?: unknown;
  eventsListReject?: unknown;
  eventsInsertResponse?: unknown;
  eventsUpdateResponse?: unknown;
} = {}): {
  getTokenMock: ReturnType<typeof vi.fn>;
  eventsListMock: ReturnType<typeof vi.fn>;
  eventsInsertMock: ReturnType<typeof vi.fn>;
  eventsUpdateMock: ReturnType<typeof vi.fn>;
} {
  const getTokenMock = vi.fn();
  const eventsListMock = vi.fn();
  const eventsInsertMock = vi.fn();
  const eventsUpdateMock = vi.fn();

  if (options.eventsListResponse !== undefined) {
    eventsListMock.mockResolvedValue(options.eventsListResponse);
  }
  if (options.eventsListReject !== undefined) {
    eventsListMock.mockRejectedValue(options.eventsListReject);
  }
  if (options.eventsInsertResponse !== undefined) {
    eventsInsertMock.mockResolvedValue(options.eventsInsertResponse);
  }
  if (options.eventsUpdateResponse !== undefined) {
    eventsUpdateMock.mockResolvedValue(options.eventsUpdateResponse);
  }

  vi.doMock("googleapis", () => ({
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(function () { return ({
          generateAuthUrl: vi.fn().mockReturnValue(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id",
          ),
          getToken: getTokenMock,
          setCredentials: vi.fn(),
        }); }),
      },
      calendar: vi.fn().mockImplementation(function () { return ({
        events: {
          list: eventsListMock,
          insert: eventsInsertMock,
          update: eventsUpdateMock,
        },
      }); }),
    },
  }));

  return { getTokenMock, eventsListMock, eventsInsertMock, eventsUpdateMock };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock("googleapis");
});

// ================================================================
// Production Validation Matrix: Google Calendar OAuth & Two-Way Sync
// ================================================================

describe("Google Calendar Production Validation Matrix", () => {

  // ── TEST GROUP 1: OAuth Token Security (T-12-21) ──────────────

  describe("OAuth exchange token security (T-12-21)", () => {
    beforeEach(() => {
      setAuthEnv();
      vi.resetModules();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it("T-12-21: exchangeGoogleCode stores encrypted refresh token, never stores raw plaintext", async () => {
      const rawRefreshToken = "my-plaintext-refresh-token";
      const { getTokenMock } = mockGoogleApis();
      getTokenMock.mockResolvedValue({
        tokens: {
          refresh_token: rawRefreshToken,
          access_token: "test-access-token",
        },
      });

      let capturedCreateRefreshToken: string | undefined;
      const upsertSpy = vi
        .spyOn(prisma.googleCalendarConnection, "upsert")
        .mockImplementation(async (args: unknown) => {
          const createArgs = (args as { create?: { refreshToken?: string } }).create;
          capturedCreateRefreshToken = createArgs?.refreshToken;
          return {
            id: "conn-1",
            userId: "user-1",
            clinicId: "clinic-1",
            refreshToken: capturedCreateRefreshToken ?? "encrypted-token",
            channelId: null,
            channelToken: null,
            channelExpiration: null,
            nextSyncToken: null,
            lastSyncedAt: null,
            lastSyncError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as never;
        });

      const { exchangeGoogleCode } = await import(
        "../../src/domain/google-calendar/googleCalendarAuthService.js"
      );

      await exchangeGoogleCode("clinic-1", "user-1", "auth-code-123");

      // The stored token must NOT be the raw plaintext
      expect(capturedCreateRefreshToken).toBeDefined();
      expect(capturedCreateRefreshToken).not.toBe(rawRefreshToken);

      // The stored token IS valid ciphertext that round-trips through decryptToken
      expect(() => decryptToken(capturedCreateRefreshToken!)).not.toThrow();
      expect(decryptToken(capturedCreateRefreshToken!)).toBe(rawRefreshToken);

      // Upsert was called once
      expect(upsertSpy).toHaveBeenCalledTimes(1);
    });

    it("T-12-21: exchangeGoogleCode response object never returns raw tokens", async () => {
      const rawRefreshToken = "my-plaintext-refresh-token";
      const { getTokenMock } = mockGoogleApis();
      getTokenMock.mockResolvedValue({
        tokens: {
          refresh_token: rawRefreshToken,
          access_token: "test-access-token",
        },
      });

      vi.spyOn(prisma.googleCalendarConnection, "upsert").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken(rawRefreshToken),
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

      // The response object must not contain any token data
      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(rawRefreshToken);
      expect(resultJson).not.toContain("refresh_token");
      expect(resultJson).not.toContain("access_token");
      expect(resultJson).not.toContain("token");

      // Standard connection response shape
      expect(result.connected).toBe(true);
      expect(result.syncState).toBe("connected");
    });

    it("T-12-21: disconnectGoogleCalendar removes connection without affecting appointments", async () => {
      mockGoogleApis();

      const deleteSpy = vi
        .spyOn(prisma.googleCalendarConnection, "delete")
        .mockResolvedValue({ id: "conn-1" } as never);

      const { disconnectGoogleCalendar } = await import(
        "../../src/domain/google-calendar/googleCalendarAuthService.js"
      );

      await disconnectGoogleCalendar("clinic-1", "user-1");

      expect(deleteSpy).toHaveBeenCalledWith({
        where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
      });
    });

    it("T-12-21: getGoogleCalendarConnectionStatus reports needs_attention on sync errors", async () => {
      mockGoogleApis();

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "token-1",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: "Sync token invalidated (410): Gone",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const { getGoogleCalendarConnectionStatus } = await import(
        "../../src/domain/google-calendar/googleCalendarAuthService.js"
      );

      const status = await getGoogleCalendarConnectionStatus("clinic-1", "user-1");

      expect(status.connected).toBe(true);
      expect(status.syncState).toBe("needs_attention");
    });
  });

  // ── TEST GROUP 2: Push with Extended Properties (T-12-23) ────

  describe("Push to Google with extended properties (T-12-23)", () => {
    beforeEach(() => {
      setAuthEnv();
      vi.resetModules();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it("T-12-23: pushAppointmentToGoogle creates event with physioAppointmentId and physioClinicId in extendedProperties", async () => {
      const { eventsInsertMock } = mockGoogleApis({
        eventsInsertResponse: { data: { id: "new-google-event-1" } },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
        id: "local-appt-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientNameSnapshot: "Ada Lovelace",
        scheduledAt: new Date("2026-05-01T09:00:00Z"),
        durationMinutes: 45,
        status: "upcoming",
        linkedSessionId: null,
        notes: null,
        syncStatus: "pending",
        syncedAt: null,
        googleEventId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "update").mockResolvedValue({ id: "local-appt-1" } as never);

      const { pushAppointmentToGoogle } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await pushAppointmentToGoogle("clinic-1", "user-1", "local-appt-1");

      expect(eventsInsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          requestBody: expect.objectContaining({
            extendedProperties: {
              private: {
                physioAppointmentId: "local-appt-1",
                physioClinicId: "clinic-1",
              },
            },
          }),
        }),
      );
    });

    it("T-12-23: pushAppointmentToGoogle updates existing event preserving extendedProperties", async () => {
      const { eventsUpdateMock } = mockGoogleApis({
        eventsUpdateResponse: { data: { id: "existing-google-event-1" } },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
        id: "local-appt-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientNameSnapshot: "Ada Lovelace",
        scheduledAt: new Date("2026-05-01T09:00:00Z"),
        durationMinutes: 45,
        status: "upcoming",
        linkedSessionId: null,
        notes: null,
        syncStatus: "pending",
        syncedAt: null,
        googleEventId: "existing-google-event-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "update").mockResolvedValue({ id: "local-appt-1" } as never);

      const { pushAppointmentToGoogle } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await pushAppointmentToGoogle("clinic-1", "user-1", "local-appt-1");

      expect(eventsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          eventId: "existing-google-event-1",
          requestBody: expect.objectContaining({
            extendedProperties: {
              private: {
                physioAppointmentId: "local-appt-1",
                physioClinicId: "clinic-1",
              },
            },
          }),
        }),
      );
    });

    it("T-12-23: pushAppointmentToGoogle updates local appointment with googleEventId and syncedAt", async () => {
      mockGoogleApis({
        eventsInsertResponse: { data: { id: "new-google-event-1" } },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
        id: "local-appt-1",
        clinicId: "clinic-1",
        patientId: "patient-1",
        patientNameSnapshot: "Ada Lovelace",
        scheduledAt: new Date("2026-05-01T09:00:00Z"),
        durationMinutes: 30,
        status: "upcoming",
        linkedSessionId: null,
        notes: null,
        syncStatus: "pending",
        syncedAt: null,
        googleEventId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const appointmentUpdateSpy = vi
        .spyOn(prisma.appointment, "update")
        .mockResolvedValue({ id: "local-appt-1" } as never);

      const { pushAppointmentToGoogle } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await pushAppointmentToGoogle("clinic-1", "user-1", "local-appt-1");

      expect(appointmentUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_clinicId: { id: "local-appt-1", clinicId: "clinic-1" } },
          data: expect.objectContaining({
            googleEventId: "new-google-event-1",
            syncStatus: "synced",
            syncedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  // ── TEST GROUP 3: Incremental Sync Reconciliation (T-12-23) ──

  describe("Incremental sync reconciliation (T-12-23)", () => {
    beforeEach(() => {
      setAuthEnv();
      vi.resetModules();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it("T-12-23: reconciles remote updates overwriting local appointment fields during incremental sync", async () => {
      mockGoogleApis({
        eventsListResponse: {
          data: {
            nextSyncToken: "incremental-token-2",
            items: [
              {
                id: "google-event-1",
                summary: "Updated Patient Name",
                start: { dateTime: "2026-05-02T14:00:00Z" },
                end: { dateTime: "2026-05-02T14:45:00Z" },
                extendedProperties: {
                  private: {
                    physioAppointmentId: "local-appt-1",
                    physioClinicId: "clinic-1",
                  },
                },
                status: "confirmed",
              },
            ],
          },
        },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "token-1",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: "incremental-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const appointmentUpsertSpy = vi
        .spyOn(prisma.appointment, "upsert")
        .mockResolvedValue({ id: "local-appt-1" } as never);

      const connectionUpdateSpy = vi
        .spyOn(prisma.googleCalendarConnection, "update")
        .mockResolvedValue({ id: "conn-1" } as never);

      const { runIncrementalCalendarSync } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await runIncrementalCalendarSync("clinic-1", "user-1");

      expect(appointmentUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            patientNameSnapshot: "Updated Patient Name",
            scheduledAt: new Date("2026-05-02T14:00:00Z"),
            durationMinutes: 45,
            googleEventId: "google-event-1",
            syncStatus: "synced",
          }),
        }),
      );
      expect(connectionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextSyncToken: "incremental-token-2",
            lastSyncError: null,
          }),
        }),
      );
    });

    it("T-12-23: soft-deletes local appointment for cancelled Google events during sync", async () => {
      mockGoogleApis({
        eventsListResponse: {
          data: {
            nextSyncToken: "incremental-token-deleted",
            items: [
              {
                id: "google-event-1",
                status: "cancelled",
              },
            ],
          },
        },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "token-1",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: "incremental-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
        id: "local-appt-1",
        clinicId: "clinic-1",
        googleEventId: "google-event-1",
      } as never);

      const appointmentUpdateSpy = vi
        .spyOn(prisma.appointment, "update")
        .mockResolvedValue({ id: "local-appt-1" } as never);

      const connectionUpdateSpy = vi
        .spyOn(prisma.googleCalendarConnection, "update")
        .mockResolvedValue({ id: "conn-1" } as never);

      const { runIncrementalCalendarSync } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await runIncrementalCalendarSync("clinic-1", "user-1");

      expect(appointmentUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id_clinicId: { id: "local-appt-1", clinicId: "clinic-1" } },
          data: expect.objectContaining({
            status: "cancelled",
            syncStatus: "synced",
          }),
        }),
      );
      expect(connectionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextSyncToken: "incremental-token-deleted",
          }),
        }),
      );
    });

    it("T-12-23: clears sync token and records error on 410 Gone from Google", async () => {
      mockGoogleApis({
        eventsListReject: { code: 410, message: "Sync token is no longer valid" },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "token-1",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: "stale-token",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const connectionUpdateSpy = vi
        .spyOn(prisma.googleCalendarConnection, "update")
        .mockResolvedValue({ id: "conn-1" } as never);

      const { runIncrementalCalendarSync } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await runIncrementalCalendarSync("clinic-1", "user-1");

      expect(connectionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
          data: expect.objectContaining({
            nextSyncToken: null,
            lastSyncError: expect.stringContaining("410"),
          }),
        }),
      );
    });

    it("T-12-23: falls back to full sync when incremental sync has no stored sync token", async () => {
      const { eventsListMock } = mockGoogleApis({
        eventsListResponse: {
          data: {
            nextSyncToken: "full-sync-token",
            items: [],
          },
        },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null, // No sync token stored
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const connectionUpdateSpy = vi
        .spyOn(prisma.googleCalendarConnection, "update")
        .mockResolvedValue({ id: "conn-1" } as never);

      const { runIncrementalCalendarSync } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      await runIncrementalCalendarSync("clinic-1", "user-1");

      // Should have performed a full sync (no syncToken in list call)
      expect(eventsListMock).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          singleEvents: true,
          timeMin: expect.any(String),
          timeMax: expect.any(String),
        }),
      );
      expect(connectionUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextSyncToken: "full-sync-token",
            lastSyncError: null,
          }),
        }),
      );
    });

    it("T-12-23: runFullCalendarSync uses 90-day lookback and 365-day forward window", async () => {
      const { eventsListMock } = mockGoogleApis({
        eventsListResponse: {
          data: {
            nextSyncToken: "new-sync-token",
            items: [],
          },
        },
      });

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: null,
        channelToken: null,
        channelExpiration: null,
        nextSyncToken: null,
        lastSyncedAt: null,
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.spyOn(prisma.googleCalendarConnection, "update").mockResolvedValue({
        id: "conn-1",
      } as never);

      const { runFullCalendarSync } = await import(
        "../../src/domain/google-calendar/googleCalendarSyncService.js"
      );

      const beforeCall = new Date();
      await runFullCalendarSync("clinic-1", "user-1");
      const afterCall = new Date();

      expect(eventsListMock).toHaveBeenCalledTimes(1);
      const callArgs = eventsListMock.mock.calls[0][0] as {
        timeMin: string;
        timeMax: string;
      };

      // timeMin should be approximately 90 days ago
      const timeMin = new Date(callArgs.timeMin);
      const expectedTimeMin = new Date(beforeCall);
      expectedTimeMin.setDate(expectedTimeMin.getDate() - 90);
      expect(Math.abs(timeMin.getTime() - expectedTimeMin.getTime())).toBeLessThan(5000);

      // timeMax should be approximately 365 days ahead
      const timeMax = new Date(callArgs.timeMax);
      const expectedTimeMax = new Date(afterCall);
      expectedTimeMax.setDate(expectedTimeMax.getDate() + 365);
      expect(Math.abs(timeMax.getTime() - expectedTimeMax.getTime())).toBeLessThan(5000);
    });
  });

  // ── TEST GROUP 4: Webhook Channel Security (T-12-22) ─────────

  describe("Webhook channel token validation (T-12-22)", () => {
    beforeEach(() => {
      setAuthEnv();
      vi.resetModules();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.restoreAllMocks();
    });

    it("T-12-22: verifyWebhookChannel accepts valid channel ID + matching token", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "valid-token",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: "sync-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await verifyWebhookChannel("channel-1", "valid-token");

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.clinicId).toBe("clinic-1");
        expect(result.userId).toBe("user-1");
      }
    });

    it("T-12-22: verifyWebhookChannel rejects unknown channel ID", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue(null);

      const result = await verifyWebhookChannel("unknown-channel", "any-token");

      expect(result.valid).toBe(false);
    });

    it("T-12-22: verifyWebhookChannel rejects mismatched channel token for known channel", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "correct-token",
        channelExpiration: new Date("2026-05-31T00:00:00Z"),
        nextSyncToken: "sync-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await verifyWebhookChannel("channel-1", "wrong-token");

      expect(result.valid).toBe(false);
    });

    it("T-12-22: verifyWebhookChannel rejects when channelId matches but token is empty", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "real-token",
        channelExpiration: new Date("2026-12-31T00:00:00Z"),
        nextSyncToken: "sync-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await verifyWebhookChannel("channel-1", "");

      expect(result.valid).toBe(false);
    });

    it("T-12-22: verifyWebhookChannel rejects expired channels", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "valid-token",
        channelExpiration: new Date("2026-04-01T00:00:00Z"),
        nextSyncToken: "sync-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await verifyWebhookChannel("channel-1", "valid-token");

      expect(result.valid).toBe(false);
    });

    it("T-12-22: verifyWebhookChannel rejects channels without an expiry", async () => {
      const { verifyWebhookChannel } = await import(
        "../../src/domain/google-calendar/googleCalendarWebhookService.js"
      );

      vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
        id: "conn-1",
        userId: "user-1",
        clinicId: "clinic-1",
        refreshToken: getEncryptedToken("test-refresh-token"),
        channelId: "channel-1",
        channelToken: "valid-token",
        channelExpiration: null,
        nextSyncToken: "sync-token-1",
        lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
        lastSyncError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await verifyWebhookChannel("channel-1", "valid-token");

      expect(result.valid).toBe(false);
    });
  });
});
