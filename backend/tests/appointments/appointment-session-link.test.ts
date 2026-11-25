import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  AppointmentNotFoundError,
  startSessionFromAppointment,
  markStaleAppointmentsMissed,
} from "../../src/domain/appointments/appointmentService.js";
import { finalizeManualNote } from "../../src/domain/notes/noteService.js";

const baseAppointmentRow = {
  id: "appt-1",
  clinicId: "clinic-1",
  patientId: "patient-1",
  patientNameSnapshot: null,
  scheduledAt: new Date("2026-05-01T09:00:00.000Z"),
  durationMinutes: 30,
  status: "upcoming" as const,
  linkedSessionId: null,
  notes: null,
  syncStatus: "manual" as const,
  syncedAt: null,
  googleEventId: null,
  createdAt: new Date("2026-04-30T10:00:00.000Z"),
  updatedAt: new Date("2026-04-30T10:00:00.000Z"),
};

const patientRow = { id: "patient-1", fullName: "Ada Lovelace" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("appointment session link", () => {
  it("starts a session from an upcoming appointment and stores linkedSessionId", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(baseAppointmentRow as never);
    const sessionCreate = vi.fn().mockResolvedValue({ id: "session-new" });
    const appointmentUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    type TransactionCallback = (tx: {
      session: { create: typeof sessionCreate };
      appointment: { updateMany: typeof appointmentUpdateMany };
    }) => Promise<string>;
    vi.spyOn(prisma, "$transaction").mockImplementation((async (callback: TransactionCallback) =>
      callback({
        session: { create: sessionCreate },
        appointment: { updateMany: appointmentUpdateMany },
      })) as never);

    const result = await startSessionFromAppointment({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      input: { sessionType: "Follow-up" },
    });

    expect(sessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startedAt: new Date("2026-05-01T09:00:00.000Z"),
        visitType: "Follow-up",
        noteStatus: "draft",
      }),
      select: { id: true },
    });
    expect(appointmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "appt-1",
          clinicId: "clinic-1",
          status: "upcoming",
          linkedSessionId: null,
        },
        data: expect.objectContaining({
          linkedSessionId: "session-new",
        }),
      }),
    );
    expect(result.linkedSessionId).toBe("session-new");
    expect(result.appointmentId).toBe("appt-1");
    expect(result.sessionId).toBe("session-new");
  });

  it("returns the existing linked session on repeat start-session", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
      ...baseAppointmentRow,
      linkedSessionId: "session-existing",
    } as never);
    const transactionSpy = vi.spyOn(prisma, "$transaction");

    const result = await startSessionFromAppointment({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      input: { sessionType: "Follow-up" },
    });

    expect(transactionSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      appointmentId: "appt-1",
      sessionId: "session-existing",
      patientId: "patient-1",
      linkedSessionId: "session-existing",
    });
  });

  it("rejects start-session for non-upcoming appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
      ...baseAppointmentRow,
      status: "completed",
    } as never);

    await expect(
      startSessionFromAppointment({
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        input: { sessionType: "Follow-up" },
      }),
    ).rejects.toThrow("Appointment is not available for session start");
  });

  it("rejects start-session for cancelled appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
      ...baseAppointmentRow,
      status: "cancelled",
    } as never);

    await expect(
      startSessionFromAppointment({
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        input: { sessionType: "Follow-up" },
      }),
    ).rejects.toThrow("Appointment is not available for session start");
  });

  it("rejects start-session for missed appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
      ...baseAppointmentRow,
      status: "missed",
    } as never);

    await expect(
      startSessionFromAppointment({
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        input: { sessionType: "Follow-up" },
      }),
    ).rejects.toThrow("Appointment is not available for session start");
  });

  it("throws AppointmentNotFoundError for missing appointments on start-session", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    await expect(
      startSessionFromAppointment({
        clinicId: "clinic-1",
        appointmentId: "missing-appt",
        input: { sessionType: "Follow-up" },
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it("marks stale upcoming appointments missed after a 15-minute grace period", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const staleScheduledAt = new Date("2026-05-01T09:30:00.000Z"); // 30 min ago, beyond 15-min grace

    const findManySpy = vi.spyOn(prisma.appointment, "findMany").mockResolvedValue([
      {
        ...baseAppointmentRow,
        id: "appt-stale",
        scheduledAt: staleScheduledAt,
        status: "upcoming",
      },
    ] as never);

    const updateManySpy = vi
      .spyOn(prisma.appointment, "updateMany")
      .mockResolvedValue({ count: 1 } as never);

    await markStaleAppointmentsMissed({ clinicId: "clinic-1", now });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          status: "upcoming",
          scheduledAt: {
            lt: new Date("2026-05-01T09:45:00.000Z"), // 15 min grace before now
          },
        }),
      }),
    );
    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["appt-stale"] },
        }),
        data: { status: "missed" },
      }),
    );
  });

  it("does not mark upcoming appointments within the 15-minute grace period as missed", async () => {
    const now = new Date("2026-05-01T10:00:00.000Z");
    const recentScheduledAt = new Date("2026-05-01T09:50:00.000Z"); // 10 min ago, within grace

    const findManySpy = vi.spyOn(prisma.appointment, "findMany").mockResolvedValue([
      {
        ...baseAppointmentRow,
        id: "appt-recent",
        scheduledAt: recentScheduledAt,
        status: "upcoming",
      },
    ] as never);

    const updateManySpy = vi
      .spyOn(prisma.appointment, "updateMany")
      .mockResolvedValue({ count: 0 } as never);

    await markStaleAppointmentsMissed({ clinicId: "clinic-1", now });

    // The grace threshold is now - 15 min = 09:45:00Z
    // Recent appointment at 09:50:00Z should NOT be included
    const findCall = findManySpy.mock.calls[0]?.[0] as { where: { scheduledAt: { lt: Date } } } | undefined;
    const graceThreshold = findCall?.where?.scheduledAt?.lt;
    expect(graceThreshold?.getTime()).toBe(new Date("2026-05-01T09:45:00.000Z").getTime());

    expect(updateManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["appt-recent"] },
        }),
        data: { status: "missed" },
      }),
    );
  });

  it("keeps cancelled and missed appointments out of active calendar reads after sweeps", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findManySpy = vi.spyOn(prisma.appointment, "findMany").mockResolvedValue([
      {
        ...baseAppointmentRow,
        id: "appt-1",
        status: "upcoming",
      },
    ] as never);

    const { listActiveAppointments } = await import(
      "../../src/domain/appointments/appointmentService.js"
    );

    const result = await listActiveAppointments({
      clinicId: "clinic-1",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          status: {
            in: ["upcoming", "completed"],
          },
        }),
      }),
    );
    expect(result.every((a) => a.status !== "cancelled" && a.status !== "missed")).toBe(true);
  });
});

describe("note finalization auto-completes linked appointment", () => {
  it("marks linked appointment as completed when note is finalized", async () => {
    const sessionWithNote = {
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      startedAt: new Date("2026-05-01T09:00:00.000Z"),
      visitType: "Follow-up",
      noteStatus: "draft" as const,
      finalNote: null,
      patientSummary: null,
      priorPlan: null,
      carryForwardContext: null,
      createdAt: new Date("2026-05-01T09:00:00.000Z"),
      updatedAt: new Date("2026-05-01T09:00:00.000Z"),
      progressNote: {
        id: "note-1",
        subjective: "Pain reduced",
        objective: "ROM improved",
        assessment: "Good progress",
        plan: "Continue exercises",
        templateKey: null,
        createdAt: new Date("2026-05-01T09:00:00.000Z"),
        updatedAt: new Date("2026-05-01T09:00:00.000Z"),
      },
    };

    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(sessionWithNote as never);
    vi.spyOn(prisma.session, "update").mockResolvedValue({
      ...sessionWithNote,
      noteStatus: "finalized",
      finalNote: "Subjective:\nPain reduced\n\nObjective:\nROM improved\n\nAssessment:\nGood progress\n\nPlan:\nContinue exercises",
    } as never);
    vi.spyOn(prisma.progressNote, "update").mockResolvedValue(sessionWithNote.progressNote as never);

    vi.spyOn(prisma.auditEvent, "create").mockResolvedValue({} as never);

    const appointmentUpdateSpy = vi
      .spyOn(prisma.appointment, "updateMany")
      .mockResolvedValue({ count: 1 } as never);

    await finalizeManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      userId: "user-1",
    });

    expect(appointmentUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          linkedSessionId: "session-1",
          status: "upcoming",
        }),
        data: { status: "completed" },
      }),
    );
  });
});
