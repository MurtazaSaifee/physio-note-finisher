import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  PatientNotFoundError,
  createPatient,
  getPatientProfile,
  listPatients,
  setPatientArchived,
  updatePatient,
} from "../../src/domain/patients/patientService.js";

const basePatientRow = {
  id: "patient-1",
  clinicId: "clinic-1",
  fullName: "Ada Lovelace",
  dateOfBirth: new Date("1990-01-23T00:00:00.000Z"),
  sex: "female" as const,
  phone: "555-0101",
  email: "ada@example.com",
  addressLine: "1 Circuit Lane",
  clinicalNotes: "Needs follow-up mobility work",
  conditionTags: ["spine"],
  sessions: [],
  _count: {
    sessions: 0,
  },
  archivedAt: null,
  createdAt: new Date("2026-04-17T10:00:00.000Z"),
  updatedAt: new Date("2026-04-17T10:00:00.000Z"),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("patientService", () => {
  beforeEach(() => {
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);
  });

  it("createPatient persists the clinic-scoped patient payload and returns a soft-active record", async () => {
    const createSpy = vi
      .spyOn(prisma.patient, "create")
      .mockResolvedValue(basePatientRow as never);

    const result = await createPatient({
      clinicId: "clinic-1",
      input: {
        fullName: "Ada Lovelace",
        dateOfBirth: "1990-01-23",
        sex: "female",
        phone: "555-0101",
        email: "ada@example.com",
        addressLine: "1 Circuit Lane",
        clinicalNotes: "Needs follow-up mobility work",
      },
    });

    expect(createSpy).toHaveBeenCalledWith({
      data: {
        clinic: {
          connect: {
            id: "clinic-1",
          },
        },
        fullName: "Ada Lovelace",
        dateOfBirth: new Date("1990-01-23T00:00:00.000Z"),
        sex: "female",
        phone: "555-0101",
        email: "ada@example.com",
        addressLine: "1 Circuit Lane",
        clinicalNotes: "Needs follow-up mobility work",
        conditionTags: [],
      },
      select: expect.objectContaining({
        fullName: true,
      }),
    });

    expect(result).toEqual({
      id: "patient-1",
      clinicId: "clinic-1",
      fullName: "Ada Lovelace",
      dateOfBirth: "1990-01-23",
      sex: "female",
      phone: "555-0101",
      email: "ada@example.com",
      addressLine: "1 Circuit Lane",
      clinicalNotes: "Needs follow-up mobility work",
      conditionTags: ["spine"],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    });
  });

  it("updatePatient updates only minimal patient fields within the clinic boundary", async () => {
    const findFirstSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue({ id: "patient-1" } as never);
    const updateSpy = vi
      .spyOn(prisma.patient, "update")
      .mockResolvedValue({
        ...basePatientRow,
        fullName: "Ada Byron",
        phone: "555-0102",
        updatedAt: new Date("2026-04-17T11:00:00.000Z"),
      } as never);

    const result = await updatePatient({
      clinicId: "clinic-1",
      patientId: "patient-1",
      input: {
        fullName: "Ada Byron",
        phone: "555-0102",
      },
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "patient-1",
        clinicId: "clinic-1",
      },
      select: {
        id: true,
      },
    });
    expect(updateSpy).toHaveBeenCalledWith({
      where: {
        id_clinicId: {
          id: "patient-1",
          clinicId: "clinic-1",
        },
      },
      data: {
        fullName: "Ada Byron",
        phone: "555-0102",
      },
      select: expect.objectContaining({
        archivedAt: true,
      }),
    });

    expect(result.fullName).toBe("Ada Byron");
    expect(result.phone).toBe("555-0102");
    expect(result.clinicId).toBe("clinic-1");
  });

  it("updatePatient rejects cross-clinic records", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(null);

    await expect(
      updatePatient({
        clinicId: "clinic-2",
        patientId: "patient-1",
        input: {
          fullName: "Ada Byron",
        },
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  it("setPatientArchived toggles archivedAt without hard deletion", async () => {
    const findFirstSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue({ id: "patient-1" } as never);
    const updateSpy = vi
      .spyOn(prisma.patient, "update")
      .mockResolvedValue({
        ...basePatientRow,
        archivedAt: new Date("2026-04-17T12:00:00.000Z"),
      } as never);

    const archived = await setPatientArchived({
      clinicId: "clinic-1",
      patientId: "patient-1",
      archived: true,
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "patient-1",
        clinicId: "clinic-1",
      },
      select: {
        id: true,
      },
    });
    expect(updateSpy).toHaveBeenCalledWith({
      where: {
        id_clinicId: {
          id: "patient-1",
          clinicId: "clinic-1",
        },
      },
      data: {
        archivedAt: expect.any(Date),
      },
      select: expect.objectContaining({
        archivedAt: true,
      }),
    });

    expect(archived.archivedAt).toBe("2026-04-17T12:00:00.000Z");
  });

  it("setPatientArchived restores archived records when archived is false", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue({
      id: "patient-1",
    } as never);
    const updateSpy = vi
      .spyOn(prisma.patient, "update")
      .mockResolvedValue({
        ...basePatientRow,
        archivedAt: null,
      } as never);

    const restored = await setPatientArchived({
      clinicId: "clinic-1",
      patientId: "patient-1",
      archived: false,
    });

    expect(updateSpy).toHaveBeenCalledWith({
      where: {
        id_clinicId: {
          id: "patient-1",
          clinicId: "clinic-1",
        },
      },
      data: {
        archivedAt: null,
      },
      select: expect.objectContaining({
        archivedAt: true,
      }),
    });

    expect(restored.archivedAt).toBeNull();
  });

  it("listPatients searches fullName, phone, and email while defaulting to active patients", async () => {
    const findManySpy = vi.spyOn(prisma.patient, "findMany").mockResolvedValue([
      {
        id: "patient-1",
        fullName: "Ada Lovelace",
        dateOfBirth: new Date("1990-01-23T00:00:00.000Z"),
        sex: "female",
        phone: "555-0101",
        email: "ada@example.com",
        addressLine: "1 Circuit Lane",
        conditionTags: [],
        sessions: [],
        _count: {
          sessions: 0,
        },
        archivedAt: null,
        createdAt: new Date("2026-04-17T10:00:00.000Z"),
        updatedAt: new Date("2026-04-17T10:00:00.000Z"),
      },
      {
        id: "patient-2",
        fullName: "Grace Hopper",
        dateOfBirth: null,
        sex: null,
        phone: "555-0109",
        email: "grace@example.com",
        addressLine: null,
        conditionTags: [],
        sessions: [],
        _count: {
          sessions: 0,
        },
        archivedAt: null,
        createdAt: new Date("2026-04-17T11:00:00.000Z"),
        updatedAt: new Date("2026-04-17T11:00:00.000Z"),
      },
    ] as never);

    const result = await listPatients({
      clinicId: "clinic-1",
      query: "ada",
      includeArchived: false,
      limit: 20,
      cursor: "patient-0",
    });

    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        clinicId: "clinic-1",
        archivedAt: null,
        OR: [
          {
            fullName: {
              contains: "ada",
              mode: "insensitive",
            },
          },
          {
            phone: {
              contains: "ada",
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: "ada",
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: [
        {
          fullName: "asc",
        },
        {
          id: "asc",
        },
      ],
      cursor: {
        id: "patient-0",
      },
      skip: 1,
      take: 21,
      select: expect.objectContaining({
        fullName: true,
      }),
    });

    expect(result).toEqual({
      items: [
        {
          id: "patient-1",
          fullName: "Ada Lovelace",
          dateOfBirth: "1990-01-23",
          sex: "female",
          phone: "555-0101",
          email: "ada@example.com",
          addressLine: "1 Circuit Lane",
          conditionTags: [],
          lastVisitDate: null,
          unfinishedNoteCount: 0,
          recentSessionStatus: null,
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-17T10:00:00.000Z",
          updatedAt: "2026-04-17T10:00:00.000Z",
        },
        {
          id: "patient-2",
          fullName: "Grace Hopper",
          dateOfBirth: null,
          sex: null,
          phone: "555-0109",
          email: "grace@example.com",
          addressLine: null,
          conditionTags: [],
          lastVisitDate: null,
          unfinishedNoteCount: 0,
          recentSessionStatus: null,
          nextAppointment: null,
          archivedAt: null,
          createdAt: "2026-04-17T11:00:00.000Z",
          updatedAt: "2026-04-17T11:00:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("listPatients includes archived patients only when explicitly requested", async () => {
    const findManySpy = vi
      .spyOn(prisma.patient, "findMany")
      .mockResolvedValue([] as never);

    await listPatients({
      clinicId: "clinic-1",
      includeArchived: true,
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
        },
      }),
    );
  });

  it("getPatientProfile returns the clinic-scoped patient profile", async () => {
    const findFirstSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue(basePatientRow as never);

    const result = await getPatientProfile({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        id: "patient-1",
        clinicId: "clinic-1",
      },
      select: expect.objectContaining({
        id: true,
        clinicId: true,
        fullName: true,
        dateOfBirth: true,
        sex: true,
        phone: true,
        email: true,
        addressLine: true,
        clinicalNotes: true,
      }),
    });

    expect(result).toEqual({
      id: "patient-1",
      fullName: "Ada Lovelace",
      dateOfBirth: "1990-01-23",
      sex: "female",
      phone: "555-0101",
      email: "ada@example.com",
      addressLine: "1 Circuit Lane",
      clinicalNotes: "Needs follow-up mobility work",
      conditionTags: ["spine"],
      lastVisitDate: null,
      unfinishedNoteCount: 0,
      recentSessionStatus: null,
      nextAppointment: null,
      archivedAt: null,
      createdAt: "2026-04-17T10:00:00.000Z",
      updatedAt: "2026-04-17T10:00:00.000Z",
    });
  });
});
