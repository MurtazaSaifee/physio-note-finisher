import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  getPatientProfile,
  listPatients,
} from "../../src/domain/patients/patientService.js";

const basePatient = {
  id: "patient-1",
  clinicId: "clinic-1",
  fullName: "Ada Lovelace",
  dateOfBirth: new Date("1990-01-23T00:00:00.000Z"),
  sex: "female" as const,
  phone: "555-0101",
  email: "ada@example.com",
  addressLine: "1 Circuit Lane",
  clinicalNotes: "Mobility follow-up",
  archivedAt: null,
  createdAt: new Date("2026-04-17T10:00:00.000Z"),
  updatedAt: new Date("2026-04-17T10:00:00.000Z"),
  conditionTags: ["Mobility", "Strength", "Pain", "Compliance"],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("patient workspace summary", () => {
  beforeEach(() => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);
  });

  it("maps workspace list fields from clinic-scoped patient, session, and note rows", async () => {
    const findManySpy = vi.spyOn(prisma.patient, "findMany").mockResolvedValue(
      [
        {
          ...basePatient,
          sessions: [
            {
              id: "session-2",
              clinicId: "clinic-1",
              sessionDate: new Date("2026-04-20T12:00:00.000Z"),
              startedAt: new Date("2026-04-20T12:00:00.000Z"),
              noteStatus: "reopened" as const,
            },
            {
              id: "session-1",
              clinicId: "clinic-1",
              sessionDate: new Date("2026-04-18T12:00:00.000Z"),
              startedAt: new Date("2026-04-18T12:00:00.000Z"),
              noteStatus: "draft" as const,
            },
          ],
          _count: { sessions: 2 },
        },
      ] as never,
    );

    const result = await listPatients({
      clinicId: "clinic-1",
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "patient-1",
        conditionTags: ["Mobility", "Strength", "Pain", "Compliance"],
        lastVisitDate: "2026-04-20T12:00:00.000Z",
        unfinishedNoteCount: 2,
        recentSessionStatus: "reopened",
        nextAppointment: null,
      }),
    ]);
    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
        }),
      }),
    );
  });

  it("maps profile workspace fields from clinic-scoped rows", async () => {
    const findFirstSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue({
        ...basePatient,
        sessions: [
          {
            id: "session-2",
            clinicId: "clinic-1",
            sessionDate: new Date("2026-04-20T12:00:00.000Z"),
            startedAt: new Date("2026-04-20T12:00:00.000Z"),
            noteStatus: "draft" as const,
          },
        ],
        _count: { sessions: 1 },
      } as never);

    const profile = await getPatientProfile({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });

    expect(profile).toEqual(
      expect.objectContaining({
        id: "patient-1",
        conditionTags: ["Mobility", "Strength", "Pain", "Compliance"],
        lastVisitDate: "2026-04-20T12:00:00.000Z",
        unfinishedNoteCount: 1,
        recentSessionStatus: "draft",
        nextAppointment: null,
      }),
    );
    expect(findFirstSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "patient-1",
          clinicId: "clinic-1",
        },
      }),
    );
  });
});
