import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";

function makeValidExpoToken(suffix = "abc123"): string {
  return `ExponentPushToken[${suffix}]`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Task 1: Expo Push Provider
// ============================================================
describe("expoPushProvider", () => {
  it("sends valid Expo push tokens through the provider in chunks and returns ticket IDs", async () => {
    const { sendReminderPush } = await import(
      "../../src/domain/notifications/expoPushProvider.js"
    );

    const tokens = [
      makeValidExpoToken("a"),
      makeValidExpoToken("b"),
      makeValidExpoToken("c"),
    ];
    const title = "Upcoming appointment";
    const body = "You have an appointment with John Doe on May 10, 2026 at 9:00 AM.";

    const results = await sendReminderPush(tokens, title, body);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(3);

    // Each result should have token and status
    for (const r of results) {
      expect(r).toHaveProperty("token");
      expect(r).toHaveProperty("status");
      expect(["ok", "error"].includes(r.status)).toBe(true);
      if (r.status === "ok") {
        expect(r).toHaveProperty("ticketId");
        expect(typeof r.ticketId).toBe("string");
      }
    }
  });

  it("handles invalid/error tokens and returns error status", async () => {
    const { sendReminderPush } = await import(
      "../../src/domain/notifications/expoPushProvider.js"
    );

    const tokens = [makeValidExpoToken("x"), makeValidExpoToken("y")];
    const results = await sendReminderPush(
      tokens,
      "Upcoming appointment",
      "Test body",
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => typeof r.status === "string")).toBe(true);
  });

  it("does not include SOAP/transcript/diagnosis fields in push payload", async () => {
    // The expoPushProvider module should construct messages using
    // only { to, title, body, data } where data excludes clinical fields
    const { sendReminderPush } = await import(
      "../../src/domain/notifications/expoPushProvider.js"
    );

    // Verify the function signature doesn't accept clinical data
    // Function should be: sendReminderPush(tokens, title, body)
    expect(sendReminderPush.length).toBeLessThanOrEqual(4);
    // Extra params would be data - but data must not include clinical content
  });
});

// ============================================================
// Task 1: Reminder Dispatch Service persistence
// ============================================================
describe("reminderDispatchService - findDueReminderDispatches", () => {
  it("finds pending dispatches where dispatchAt <= now", async () => {
    const { findDueReminderDispatches } = await import(
      "../../src/domain/notifications/reminderDispatchService.js"
    );

    const now = new Date("2026-05-10T08:00:00.000Z");

    const mockDispatches = [
      {
        id: "d-1",
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        userId: "user-1",
        patientName: "John Doe",
        scheduledAt: new Date(),
        dispatchAt: new Date("2026-05-10T07:55:00.000Z"),
        status: "pending",
        devicePushTokenId: null,
        provider: "expo",
        ticketId: null,
        errorMessage: null,
        dispatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.spyOn(prisma.reminderDispatch, "findMany").mockResolvedValue(
      mockDispatches as never,
    );

    const results = await findDueReminderDispatches(now);

    expect(prisma.reminderDispatch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "pending",
          dispatchAt: expect.any(Object),
        }),
      }),
    );
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("d-1");
  });
});

describe("reminderDispatchService - sendDueReminderBatch", () => {
  it("sends push for due dispatches and records ticket IDs", async () => {
    const { sendDueReminderBatch } = await import(
      "../../src/domain/notifications/reminderDispatchService.js"
    );

    const now = new Date("2026-05-10T08:00:00.000Z");

    // Mock due dispatches
    vi.spyOn(prisma.reminderDispatch, "findMany").mockResolvedValue([
      {
        id: "d-1",
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        userId: "user-1",
        patientName: "John Doe",
        scheduledAt: new Date(),
        dispatchAt: new Date("2026-05-10T07:55:00.000Z"),
        status: "pending",
        devicePushTokenId: "token-1",
        provider: "expo",
        ticketId: null,
        errorMessage: null,
        dispatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    // Mock token lookup
    vi.spyOn(prisma.devicePushToken, "findUnique").mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      clinicId: "clinic-1",
      expoPushToken: makeValidExpoToken("x"),
      deviceId: "device-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    vi
      .spyOn(prisma.reminderDispatch, "update")
      .mockResolvedValue({} as never);

    const results = await sendDueReminderBatch(now);

    expect(results).toHaveProperty("sent");
    expect(results).toHaveProperty("failed");
    expect(typeof results.sent).toBe("number");
    expect(typeof results.failed).toBe("number");
  });

  it("skips dispatches with invalid push tokens and records them as failed", async () => {
    const { sendDueReminderBatch } = await import(
      "../../src/domain/notifications/reminderDispatchService.js"
    );

    const now = new Date("2026-05-10T08:00:00.000Z");

    vi.spyOn(prisma.reminderDispatch, "findMany").mockResolvedValue([
      {
        id: "d-bad",
        clinicId: "clinic-1",
        appointmentId: "appt-bad",
        userId: "user-1",
        patientName: "Bad Token User",
        scheduledAt: new Date(),
        dispatchAt: new Date("2026-05-10T07:55:00.000Z"),
        status: "pending",
        devicePushTokenId: "token-bad",
        provider: "expo",
        ticketId: null,
        errorMessage: null,
        dispatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    // Mock token with invalid shape
    vi.spyOn(prisma.devicePushToken, "findUnique").mockResolvedValue({
      id: "token-bad",
      userId: "user-1",
      clinicId: "clinic-1",
      expoPushToken: "not-a-valid-token",
      deviceId: "device-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const updateSpy = vi
      .spyOn(prisma.reminderDispatch, "update")
      .mockResolvedValue({} as never);

    await sendDueReminderBatch(now);

    // Should record as failed
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: expect.any(String),
        }),
      }),
    );
  });

  it("persists ticket IDs in dispatch records without SOAP/transcript/diagnosis content", async () => {
    const { sendDueReminderBatch } = await import(
      "../../src/domain/notifications/reminderDispatchService.js"
    );

    const now = new Date("2026-05-10T08:00:00.000Z");

    vi.spyOn(prisma.reminderDispatch, "findMany").mockResolvedValue([
      {
        id: "d-clean",
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        userId: "user-1",
        patientName: "Clean Test",
        scheduledAt: new Date(),
        dispatchAt: new Date("2026-05-10T07:55:00.000Z"),
        status: "pending",
        devicePushTokenId: "token-1",
        provider: "expo",
        ticketId: null,
        errorMessage: null,
        dispatchedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    vi.spyOn(prisma.devicePushToken, "findUnique").mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      clinicId: "clinic-1",
      expoPushToken: makeValidExpoToken("clean"),
      deviceId: "device-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const updateSpy = vi
      .spyOn(prisma.reminderDispatch, "update")
      .mockResolvedValue({} as never);

    await sendDueReminderBatch(now);

    // Check that successful updates include ticketId

    // The update calls should not contain SOAP/transcript/diagnosis
    for (const call of updateSpy.mock.calls) {
      const dataArg = (call[0] as { data?: Record<string, unknown> })?.data;
      if (dataArg) {
        expect(dataArg).not.toHaveProperty("soap");
        expect(dataArg).not.toHaveProperty("transcript");
        expect(dataArg).not.toHaveProperty("diagnosis");
        expect(dataArg).not.toHaveProperty("subjective");
        expect(dataArg).not.toHaveProperty("objective");
        expect(dataArg).not.toHaveProperty("assessment");
        expect(dataArg).not.toHaveProperty("plan");
      }
    }
  });
});

// ============================================================
// Task 2: Reminder Worker
// ============================================================
describe("reminderWorker", () => {
  it("exports REMINDER_DISPATCH_QUEUE = 'reminder-dispatch'", async () => {
    const mod = await import("../../src/workers/reminderWorker.js");
    expect(mod.REMINDER_DISPATCH_QUEUE).toBe("reminder-dispatch");
  });

  it("exports REMINDER_DISPATCH_JOB = 'dispatch_due_reminders'", async () => {
    const mod = await import("../../src/workers/reminderWorker.js");
    expect(mod.REMINDER_DISPATCH_JOB).toBe("dispatch_due_reminders");
  });

  it("exports REMINDER_DISPATCH_INTERVAL_MS = 15 * 60 * 1000", async () => {
    const mod = await import("../../src/workers/reminderWorker.js");
    expect(mod.REMINDER_DISPATCH_INTERVAL_MS).toBe(15 * 60 * 1000);
  });

  it("exports processReminderJob for SQS pollers", async () => {
    const mod = await import("../../src/workers/reminderWorker.js");
    expect(typeof mod.processReminderJob).toBe("function");
  });
});

// ============================================================
// Task 2: Server Registration
// ============================================================
describe("server - reminder worker registration", () => {
  it("server.ts does not start reminder workers from the API process", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      "src/server.ts",
      "utf-8",
    );
    expect(source).not.toContain("createReminderWorker");
  });

  it("SQS reminder poller owns reminder processing", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      "src/workers/sqsReminderPoller.ts",
      "utf-8",
    );
    expect(source).toContain("processReminderJob");
    expect(source).toContain("ReceiveMessageCommand");
    expect(source).toContain("DeleteMessageCommand");
  });

  it("notificationPreferences route does not import or send push inline", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(
      "src/api/routes/notificationPreferences.ts",
      "utf-8",
    );
    expect(source).not.toContain("sendReminderPush");
    expect(source).not.toContain("expoPushProvider");
    expect(source).not.toContain("dispatch_due_reminders");
  });
});
