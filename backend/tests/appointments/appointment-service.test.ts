import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  AppointmentNotFoundError,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  listActiveAppointments,
  getAppointmentHistory,
  getAppointmentDetail,
  rescheduleAppointment,
} from "../../src/domain/appointments/appointmentService.js";
import { PatientNotFoundError } from "../../src/domain/patients/patientService.js";

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

describe("appointmentService", () => {
  it("creates a local appointment after verifying the clinic-scoped patient", async () => {
    const patientFindSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue(patientRow as never);
    const createSpy = vi
      .spyOn(prisma.appointment, "create")
      .mockResolvedValue(baseAppointmentRow as never);

    const result = await createAppointment({
      clinicId: "clinic-1",
      input: {
        patientId: "patient-1",
        scheduledAt: "2026-05-01T09:00:00.000Z",
        durationMinutes: 30,
      },
    });

    expect(patientFindSpy).toHaveBeenCalledWith({
      where: {
        clinicId: "clinic-1",
        id: "patient-1",
      },
      select: {
        id: true,
        fullName: true,
      },
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinic: expect.objectContaining({
            connect: { id: "clinic-1" },
          }),
          patient: expect.objectContaining({
            connect: {
              id_clinicId: { id: "patient-1", clinicId: "clinic-1" },
            },
          }),
          scheduledAt: new Date("2026-05-01T09:00:00.000Z"),
          durationMinutes: 30,
          status: "upcoming",
          syncStatus: "manual",
        }),
      }),
    );
    expect(result.id).toBe("appt-1");
    expect(result.status).toBe("upcoming");
    expect(result.patientId).toBe("patient-1");
  });

  it("rejects local appointment creation without a valid patientId", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(null);

    await expect(
      createAppointment({
        clinicId: "clinic-1",
        input: {
          patientId: "missing-patient",
          scheduledAt: "2026-05-01T09:00:00.000Z",
          durationMinutes: 30,
        },
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  it("allows Google-imported orphan appointments with patientId null and patientNameSnapshot", async () => {
    const createSpy = vi
      .spyOn(prisma.appointment, "create")
      .mockResolvedValue({
        ...baseAppointmentRow,
        patientId: null,
        patientNameSnapshot: "Unknown Patient",
        syncStatus: "synced",
        googleEventId: "google-event-1",
      } as never);

    const result = await createAppointment({
      clinicId: "clinic-1",
      input: {
        patientId: null,
        patientNameSnapshot: "Unknown Patient",
        scheduledAt: "2026-05-01T10:00:00.000Z",
        durationMinutes: 45,
        syncStatus: "synced",
        googleEventId: "google-event-1",
      },
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinic: expect.objectContaining({
            connect: { id: "clinic-1" },
          }),
          patientNameSnapshot: "Unknown Patient",
          syncStatus: "synced",
          googleEventId: "google-event-1",
        }),
      }),
    );
    expect(result.patientId).toBeNull();
    expect(result.patientName).toBe("Unknown Patient");
  });

  it("updates appointment scheduledAt, durationMinutes, and notes within clinic scope", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findFirstSpy = vi
      .spyOn(prisma.appointment, "findFirst")
      .mockResolvedValue({ id: "appt-1" } as never);
    const updateSpy = vi
      .spyOn(prisma.appointment, "update")
      .mockResolvedValue({
        ...baseAppointmentRow,
        scheduledAt: new Date("2026-05-01T11:00:00.000Z"),
        durationMinutes: 60,
        notes: "Updated notes",
        updatedAt: new Date("2026-04-30T11:00:00.000Z"),
      } as never);

    const result = await updateAppointment({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      input: {
        scheduledAt: "2026-05-01T11:00:00.000Z",
        durationMinutes: 60,
        notes: "Updated notes",
      },
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "appt-1",
        clinicId: "clinic-1",
      },
      select: {
        id: true,
      },
    });
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: new Date("2026-05-01T11:00:00.000Z"),
          durationMinutes: 60,
          notes: "Updated notes",
        }),
      }),
    );
    expect(result.durationMinutes).toBe(60);
    expect(result.notes).toBe("Updated notes");
  });

  it("rejects update for cross-clinic appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    await expect(
      updateAppointment({
        clinicId: "clinic-2",
        appointmentId: "appt-1",
        input: {
          durationMinutes: 60,
        },
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it("reschedules an appointment by updating scheduledAt", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findFirstSpy = vi
      .spyOn(prisma.appointment, "findFirst")
      .mockResolvedValue({ id: "appt-1" } as never);
    const updateSpy = vi
      .spyOn(prisma.appointment, "update")
      .mockResolvedValue({
        ...baseAppointmentRow,
        scheduledAt: new Date("2026-05-02T14:00:00.000Z"),
        updatedAt: new Date("2026-04-30T12:00:00.000Z"),
      } as never);

    const result = await rescheduleAppointment({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
      scheduledAt: "2026-05-02T14:00:00.000Z",
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "appt-1",
        clinicId: "clinic-1",
      },
      select: {
        id: true,
      },
    });
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scheduledAt: new Date("2026-05-02T14:00:00.000Z"),
        }),
      }),
    );
    expect(result.scheduledAt).toBe("2026-05-02T14:00:00.000Z");
  });

  it("cancels an appointment by setting status to cancelled", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findFirstSpy = vi
      .spyOn(prisma.appointment, "findFirst")
      .mockResolvedValue({ id: "appt-1" } as never);
    const updateSpy = vi
      .spyOn(prisma.appointment, "update")
      .mockResolvedValue({
        ...baseAppointmentRow,
        status: "cancelled",
        updatedAt: new Date("2026-04-30T13:00:00.000Z"),
      } as never);

    const result = await cancelAppointment({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "appt-1",
        clinicId: "clinic-1",
      },
      select: {
        id: true,
      },
    });
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "cancelled",
        }),
      }),
    );
    expect(result.status).toBe("cancelled");
  });

  it("lists only upcoming and completed appointments as active", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findManySpy = vi
      .spyOn(prisma.appointment, "findMany")
      .mockResolvedValue([
        {
          ...baseAppointmentRow,
          id: "appt-1",
          status: "upcoming",
        },
        {
          ...baseAppointmentRow,
          id: "appt-2",
          status: "completed",
          scheduledAt: new Date("2026-04-28T10:00:00.000Z"),
        },
      ] as never);

    const result = await listActiveAppointments({
      clinicId: "clinic-1",
      date: "2026-05-01",
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
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("upcoming");
    expect(result[1].status).toBe("completed");
  });

  it("excludes cancelled and missed appointments from active list", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findManySpy = vi
      .spyOn(prisma.appointment, "findMany")
      .mockResolvedValue([
        {
          ...baseAppointmentRow,
          id: "appt-1",
          status: "upcoming",
        },
      ] as never);

    const result = await listActiveAppointments({
      clinicId: "clinic-1",
      date: "2026-05-01",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: {
            in: ["upcoming", "completed"],
          },
        }),
      }),
    );
    expect(result.every((a) => a.status !== "cancelled" && a.status !== "missed")).toBe(true);
  });

  it("returns cancelled and missed appointments from history", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findManySpy = vi
      .spyOn(prisma.appointment, "findMany")
      .mockResolvedValue([
        {
          ...baseAppointmentRow,
          id: "appt-3",
          status: "cancelled",
          scheduledAt: new Date("2026-04-25T09:00:00.000Z"),
        },
        {
          ...baseAppointmentRow,
          id: "appt-4",
          status: "missed",
          scheduledAt: new Date("2026-04-26T10:00:00.000Z"),
        },
      ] as never);

    const result = await getAppointmentHistory({
      clinicId: "clinic-1",
      limit: 20,
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          status: {
            in: ["cancelled", "missed"],
          },
        }),
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("cancelled");
    expect(result[1].status).toBe("missed");
  });

  it("returns appointment detail for same-clinic records", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findFirstSpy = vi
      .spyOn(prisma.appointment, "findFirst")
      .mockResolvedValue(baseAppointmentRow as never);

    const result = await getAppointmentDetail({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
    });

    expect(findFirstSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "appt-1",
          clinicId: "clinic-1",
        },
      }),
    );
    expect(result.id).toBe("appt-1");
    expect(result.patientId).toBe("patient-1");
    expect(result.status).toBe("upcoming");
  });

  it("throws AppointmentNotFoundError for missing appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    await expect(
      getAppointmentDetail({
        clinicId: "clinic-1",
        appointmentId: "missing-appt",
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });

  it("renders reminder text in D-15 format for local appointments", async () => {
    const findFirstSpy = vi
      .spyOn(prisma.appointment, "findFirst")
      .mockResolvedValue(baseAppointmentRow as never);
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);

    const result = await getAppointmentDetail({
      clinicId: "clinic-1",
      appointmentId: "appt-1",
    });

    expect(findFirstSpy).toHaveBeenCalled();
    expect(result.reminderText).toBe(
      "You have an appointment with Ada Lovelace on May 1, 2026 at 9:00 AM.",
    );
  });

  it("renders reminder text using patientNameSnapshot for orphan appointments", async () => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue({
      ...baseAppointmentRow,
      patientId: null,
      patientNameSnapshot: "Unknown Patient",
    } as never);

    const result = await getAppointmentDetail({
      clinicId: "clinic-1",
      appointmentId: "appt-orphan",
    });

    expect(result.reminderText).toBe(
      "You have an appointment with Unknown Patient on May 1, 2026 at 9:00 AM.",
    );
  });
});
