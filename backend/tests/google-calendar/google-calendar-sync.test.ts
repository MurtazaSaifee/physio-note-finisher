import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { encryptToken } from "../../src/domain/google-calendar/tokenCipher.js";

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
  eventsDeleteResponse?: unknown;
} = {}): {
  eventsListMock: ReturnType<typeof vi.fn>;
  eventsInsertMock: ReturnType<typeof vi.fn>;
  eventsUpdateMock: ReturnType<typeof vi.fn>;
  eventsDeleteMock: ReturnType<typeof vi.fn>;
} {
  const eventsListMock = vi.fn();
  const eventsInsertMock = vi.fn();
  const eventsUpdateMock = vi.fn();
  const eventsDeleteMock = vi.fn();

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
  if (options.eventsDeleteResponse !== undefined) {
    eventsDeleteMock.mockResolvedValue(options.eventsDeleteResponse);
  }

  vi.doMock("googleapis", () => ({
    google: {
      auth: {
        OAuth2: vi.fn().mockImplementation(function () { return ({
          generateAuthUrl: vi.fn(),
          getToken: vi.fn(),
          setCredentials: vi.fn(),
        }); }),
      },
      calendar: vi.fn().mockImplementation(function () { return ({
        events: {
          list: eventsListMock,
          insert: eventsInsertMock,
          update: eventsUpdateMock,
          delete: eventsDeleteMock,
        },
      }); }),
    },
  }));

  return { eventsListMock, eventsInsertMock, eventsUpdateMock, eventsDeleteMock };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.doUnmock("googleapis");
});

describe("googleCalendarSyncService", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-18: runFullCalendarSync fetches events and creates local appointments, storing nextSyncToken", async () => {
    const { eventsListMock } = mockGoogleApis({
      eventsListResponse: {
        data: {
          nextSyncToken: "new-sync-token",
          items: [
            {
              id: "google-event-1",
              summary: "Ada Lovelace",
              start: { dateTime: "2026-05-01T09:00:00Z" },
              end: { dateTime: "2026-05-01T09:30:00Z" },
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

    vi
      .spyOn(prisma.googleCalendarConnection, "findFirst")
      .mockResolvedValue({
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

    const appointmentUpsertSpy = vi
      .spyOn(prisma.appointment, "upsert")
      .mockResolvedValue({ id: "local-appt-1" } as never);

    const connectionUpdateSpy = vi
      .spyOn(prisma.googleCalendarConnection, "update")
      .mockResolvedValue({ id: "conn-1" } as never);

    const { runFullCalendarSync } = await import(
      "../../src/domain/google-calendar/googleCalendarSyncService.js"
    );

    await runFullCalendarSync("clinic-1", "user-1");

    expect(eventsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        singleEvents: true,
        timeMin: expect.any(String),
        timeMax: expect.any(String),
      }),
    );
    expect(appointmentUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_clinicId: {
            id: "local-appt-1",
            clinicId: "clinic-1",
          },
        },
        create: expect.objectContaining({
          id: "local-appt-1",
          googleEventId: "google-event-1",
          patientNameSnapshot: "Ada Lovelace",
          scheduledAt: new Date("2026-05-01T09:00:00Z"),
          durationMinutes: 30,
          syncStatus: "synced",
        }),
        update: expect.objectContaining({
          googleEventId: "google-event-1",
          patientNameSnapshot: "Ada Lovelace",
          scheduledAt: new Date("2026-05-01T09:00:00Z"),
          durationMinutes: 30,
          syncStatus: "synced",
        }),
      }),
    );
    expect(connectionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
        data: expect.objectContaining({
          nextSyncToken: "new-sync-token",
        }),
      }),
    );
  });

  it("D-22: runIncrementalCalendarSync reuses stored syncToken and overwrites local appointments when Google differs", async () => {
    const { eventsListMock } = mockGoogleApis({
      eventsListResponse: {
        data: {
          nextSyncToken: "incremental-token-2",
          items: [
            {
              id: "google-event-1",
              summary: "Updated Name",
              start: { dateTime: "2026-05-01T10:00:00Z" },
              end: { dateTime: "2026-05-01T10:30:00Z" },
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

    expect(eventsListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        singleEvents: true,
        syncToken: "incremental-token-1",
      }),
    );
    expect(appointmentUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          patientNameSnapshot: "Updated Name",
          scheduledAt: new Date("2026-05-01T10:00:00Z"),
          durationMinutes: 30,
        }),
      }),
    );
    expect(connectionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextSyncToken: "incremental-token-2",
        }),
      }),
    );
  });

  it("D-22: 410 Gone from Google clears the stored sync cursor and triggers a full re-sync", async () => {
    mockGoogleApis({
      eventsListReject: { code: 410, message: "Sync token is no longer valid" },
    });

    vi
      .spyOn(prisma.googleCalendarConnection, "findFirst")
      .mockResolvedValue({
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

  it("D-25: Google deleted events are soft-deleted locally during incremental sync", async () => {
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

    vi
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
  });

  it("D-24: pushAppointmentToGoogle creates a Google event with extendedProperties and updates local googleEventId", async () => {
    const { eventsInsertMock } = mockGoogleApis({
      eventsInsertResponse: {
        data: {
          id: "new-google-event-1",
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

    expect(eventsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        requestBody: expect.objectContaining({
          summary: "Ada Lovelace",
          start: { dateTime: new Date("2026-05-01T09:00:00Z").toISOString() },
          end: { dateTime: new Date("2026-05-01T09:30:00Z").toISOString() },
          extendedProperties: {
            private: {
              physioAppointmentId: "local-appt-1",
              physioClinicId: "clinic-1",
            },
          },
        }),
      }),
    );
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

  it("D-24: pushAppointmentToGoogle updates an existing Google event when googleEventId is already set", async () => {
    const { eventsUpdateMock } = mockGoogleApis({
      eventsUpdateResponse: {
        data: {
          id: "existing-google-event-1",
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
      googleEventId: "existing-google-event-1",
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

    expect(eventsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: "primary",
        eventId: "existing-google-event-1",
        requestBody: expect.objectContaining({
          summary: "Ada Lovelace",
        }),
      }),
    );
    expect(appointmentUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          syncStatus: "synced",
          syncedAt: expect.any(Date),
        }),
      }),
    );
  });
});

describe("googleCalendarWebhookService", () => {
  beforeEach(() => {
    setAuthEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-23: verifyWebhookChannel validates the X-Goog-Channel-Token against stored channelToken", async () => {
    const { verifyWebhookChannel } = await import(
      "../../src/domain/google-calendar/googleCalendarWebhookService.js"
    );

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: getEncryptedToken("test-refresh-token"),
      channelId: "channel-1",
      channelToken: "expected-token",
      channelExpiration: new Date("2026-12-31T00:00:00Z"),
      nextSyncToken: "sync-token-1",
      lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await verifyWebhookChannel("channel-1", "expected-token");
    expect(result.valid).toBe(true);
    expect(result.clinicId).toBe("clinic-1");
    expect(result.userId).toBe("user-1");
  });

  it("D-23: verifyWebhookChannel rejects unknown channels with 401-equivalent result", async () => {
    const { verifyWebhookChannel } = await import(
      "../../src/domain/google-calendar/googleCalendarWebhookService.js"
    );

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue(null);

    const result = await verifyWebhookChannel("unknown-channel", "any-token");
    expect(result.valid).toBe(false);
  });

  it("D-23: verifyWebhookChannel rejects mismatched channel tokens", async () => {
    const { verifyWebhookChannel } = await import(
      "../../src/domain/google-calendar/googleCalendarWebhookService.js"
    );

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: getEncryptedToken("test-refresh-token"),
      channelId: "channel-1",
      channelToken: "expected-token",
      channelExpiration: new Date("2026-12-31T00:00:00Z"),
      nextSyncToken: "sync-token-1",
      lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await verifyWebhookChannel("channel-1", "wrong-token");
    expect(result.valid).toBe(false);
  });

  it("D-23: verifyWebhookChannel rejects channels without an expiry", async () => {
    const { verifyWebhookChannel } = await import(
      "../../src/domain/google-calendar/googleCalendarWebhookService.js"
    );

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue({
      id: "conn-1",
      userId: "user-1",
      clinicId: "clinic-1",
      refreshToken: getEncryptedToken("test-refresh-token"),
      channelId: "channel-1",
      channelToken: "expected-token",
      channelExpiration: null,
      nextSyncToken: "sync-token-1",
      lastSyncedAt: new Date("2026-04-30T10:00:00Z"),
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await verifyWebhookChannel("channel-1", "expected-token");
    expect(result.valid).toBe(false);
  });
});

describe("googleCalendarQueue", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("D-24: enqueuePush stores a push job for the given appointment", async () => {
    const { enqueuePush, createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    const job = await enqueuePush(queue, "clinic-1", "user-1", "local-appt-1");

    expect(job).toEqual(
      expect.objectContaining({
        id: expect.any(String),
      }),
    );
  });

  it("D-23: enqueueIncrementalSync stores a sync job for the given clinician", async () => {
    const { enqueueIncrementalSync, createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    const job = await enqueueIncrementalSync(queue, "clinic-1", "user-1");

    expect(job).toEqual(
      expect.objectContaining({
        id: expect.any(String),
      }),
    );
  });
});

describe("googleCalendar webhook routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("D-23: POST /webhooks/google-calendar accepts a valid channel token and enqueues incremental sync", async () => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify();

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

    const { registerGoogleCalendarWebhookRoutes } = await import(
      "../../src/api/routes/webhooks/googleCalendar.js"
    );
    const { createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    registerGoogleCalendarWebhookRoutes(app, queue);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/google-calendar",
      headers: {
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid-token",
        "x-goog-resource-id": "resource-1",
      },
    });

    expect(response.statusCode).toBe(202);
  });

  it("D-23: POST /webhooks/google-calendar rejects requests with unknown channel token", async () => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify();

    vi.spyOn(prisma.googleCalendarConnection, "findFirst").mockResolvedValue(null);

    const { registerGoogleCalendarWebhookRoutes } = await import(
      "../../src/api/routes/webhooks/googleCalendar.js"
    );
    const { createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    registerGoogleCalendarWebhookRoutes(app, queue);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/google-calendar",
      headers: {
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "invalid-token",
        "x-goog-resource-id": "resource-1",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("D-23: POST /webhooks/google-calendar rejects expired channels", async () => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify();

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

    const { registerGoogleCalendarWebhookRoutes } = await import(
      "../../src/api/routes/webhooks/googleCalendar.js"
    );
    const { createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    registerGoogleCalendarWebhookRoutes(app, queue);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/google-calendar",
      headers: {
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid-token",
        "x-goog-resource-id": "resource-1",
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it("D-23: POST /webhooks/google-calendar rejects channels without an expiry", async () => {
    const Fastify = (await import("fastify")).default;
    const app = Fastify();

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

    const { registerGoogleCalendarWebhookRoutes } = await import(
      "../../src/api/routes/webhooks/googleCalendar.js"
    );
    const { createInMemoryGoogleCalendarQueue } = await import(
      "../../src/domain/google-calendar/googleCalendarQueue.js"
    );

    const queue = createInMemoryGoogleCalendarQueue();
    registerGoogleCalendarWebhookRoutes(app, queue);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/google-calendar",
      headers: {
        "x-goog-channel-id": "channel-1",
        "x-goog-channel-token": "valid-token",
        "x-goog-resource-id": "resource-1",
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
