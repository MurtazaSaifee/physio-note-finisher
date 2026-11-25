import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  getReminderPreference,
  updateReminderPreference,
  registerDevicePushToken,
  getDevicePushTokens,
} from "../../src/domain/notifications/reminderPreferenceService.js";
import {
  buildReminderText,
  scheduleReminderDispatch,
} from "../../src/domain/notifications/reminderDispatchService.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("reminderPreferenceService", () => {
  it("returns default reminder timing when no preference exists", async () => {
    vi.spyOn(prisma.clinicianNotificationPreference, "findUnique").mockResolvedValue(null);

    const result = await getReminderPreference({
      userId: "user-1",
      clinicId: "clinic-1",
    });

    expect(result).toEqual({
      defaultReminderTiming: "30m",
      pushEnabled: true,
    });
  });

  it("returns persisted reminder timing and pushEnabled", async () => {
    vi.spyOn(prisma.clinicianNotificationPreference, "findUnique").mockResolvedValue({
      id: "pref-1",
      userId: "user-1",
      clinicId: "clinic-1",
      defaultReminderTiming: "2h",
      pushEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getReminderPreference({
      userId: "user-1",
      clinicId: "clinic-1",
    });

    expect(result.defaultReminderTiming).toBe("2h");
    expect(result.pushEnabled).toBe(false);
  });

  it("upserts reminder preference with valid timing", async () => {
    const upsertSpy = vi
      .spyOn(prisma.clinicianNotificationPreference, "upsert")
      .mockResolvedValue({
        id: "pref-1",
        userId: "user-1",
        clinicId: "clinic-1",
        defaultReminderTiming: "1d",
        pushEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

    const result = await updateReminderPreference({
      userId: "user-1",
      clinicId: "clinic-1",
      defaultReminderTiming: "1d",
      pushEnabled: true,
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_clinicId: { userId: "user-1", clinicId: "clinic-1" } },
        update: { defaultReminderTiming: "1d", pushEnabled: true },
        create: {
          userId: "user-1",
          clinicId: "clinic-1",
          defaultReminderTiming: "1d",
          pushEnabled: true,
        },
      }),
    );
    expect(result.defaultReminderTiming).toBe("1d");
  });

  it("rejects invalid reminder timing values", async () => {
    await expect(
      updateReminderPreference({
        userId: "user-1",
        clinicId: "clinic-1",
        defaultReminderTiming: "5m" as never,
        pushEnabled: true,
      }),
    ).rejects.toThrow("Invalid reminder timing");
  });
});

describe("reminderDispatchService", () => {
  it("builds exact D-15 reminder text from appointment metadata", () => {
    const text = buildReminderText("Ada Lovelace", "2026-05-01T09:00:00.000Z");
    expect(text).toBe("You have an appointment with Ada Lovelace on May 1, 2026 at 9:00 AM.");
  });

  it("builds reminder text without SOAP content or internal IDs", () => {
    const text = buildReminderText("Grace Hopper", "2026-06-15T14:30:00.000Z");
    expect(text).not.toContain("subjective");
    expect(text).not.toContain("session-");
    expect(text).not.toContain("appt-");
    expect(text).toContain("Grace Hopper");
  });

  it("computes reminder dispatch time based on global timing preference", () => {
    const scheduledAt = "2026-05-01T09:00:00.000Z";
    const dispatch = scheduleReminderDispatch({
      patientName: "Ada Lovelace",
      scheduledAt,
      timingPreference: "1h",
    });

    expect(dispatch.reminderText).toBe(
      "You have an appointment with Ada Lovelace on May 1, 2026 at 9:00 AM.",
    );
    expect(dispatch.sendAt).toBe("2026-05-01T08:00:00.000Z");
  });

  it("supports all four timing options: 30m, 1h, 2h, 1d", () => {
    const scheduledAt = "2026-05-01T12:00:00.000Z";

    const thirtyMin = scheduleReminderDispatch({
      patientName: "Test",
      scheduledAt,
      timingPreference: "30m",
    });
    expect(thirtyMin.sendAt).toBe("2026-05-01T11:30:00.000Z");

    const oneHour = scheduleReminderDispatch({
      patientName: "Test",
      scheduledAt,
      timingPreference: "1h",
    });
    expect(oneHour.sendAt).toBe("2026-05-01T11:00:00.000Z");

    const twoHours = scheduleReminderDispatch({
      patientName: "Test",
      scheduledAt,
      timingPreference: "2h",
    });
    expect(twoHours.sendAt).toBe("2026-05-01T10:00:00.000Z");

    const oneDay = scheduleReminderDispatch({
      patientName: "Test",
      scheduledAt,
      timingPreference: "1d",
    });
    expect(oneDay.sendAt).toBe("2026-04-30T12:00:00.000Z");
  });
});

describe("devicePushTokenService", () => {
  it("registers a new Expo push token for a clinician", async () => {
    const upsertSpy = vi
      .spyOn(prisma.devicePushToken, "upsert")
      .mockResolvedValue({
        id: "token-1",
        userId: "user-1",
        clinicId: "clinic-1",
        expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
        deviceId: "device-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

    const result = await registerDevicePushToken({
      userId: "user-1",
      clinicId: "clinic-1",
      expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
      deviceId: "device-1",
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_clinicId_deviceId: {
            userId: "user-1",
            clinicId: "clinic-1",
            deviceId: "device-1",
          },
        },
        update: { expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" },
        create: {
          userId: "user-1",
          clinicId: "clinic-1",
          expoPushToken: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
          deviceId: "device-1",
        },
      }),
    );
    expect(result.expoPushToken).toBe("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]");
  });

  it("lists registered push tokens for a clinician", async () => {
    vi.spyOn(prisma.devicePushToken, "findMany").mockResolvedValue([
      {
        id: "token-1",
        userId: "user-1",
        clinicId: "clinic-1",
        expoPushToken: "ExponentPushToken[abc123]",
        deviceId: "device-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const result = await getDevicePushTokens({
      userId: "user-1",
      clinicId: "clinic-1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].expoPushToken).toBe("ExponentPushToken[abc123]");
  });

  it("validates Expo push token shape on registration", async () => {
    await expect(
      registerDevicePushToken({
        userId: "user-1",
        clinicId: "clinic-1",
        expoPushToken: "invalid-token",
        deviceId: "device-1",
      }),
    ).rejects.toThrow("Invalid push token");
  });
});
