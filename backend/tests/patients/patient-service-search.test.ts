import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { listPatients } from "../../src/domain/patients/patientService.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("patientService search", () => {
  it("builds an OR query with ILIKE filters for fullName, phone, and email", async () => {
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
        _count: { sessions: 0 },
        archivedAt: null,
        createdAt: new Date("2026-04-17T10:00:00.000Z"),
        updatedAt: new Date("2026-04-17T10:00:00.000Z"),
      },
    ] as never);

    await listPatients({
      clinicId: "clinic-1",
      query: "ada",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
          archivedAt: null,
          OR: [
            { fullName: { contains: "ada", mode: "insensitive" } },
            { phone: { contains: "ada", mode: "insensitive" } },
            { email: { contains: "ada", mode: "insensitive" } },
          ],
        },
      }),
    );
  });

  it("trims the search query before applying filters", async () => {
    const findManySpy = vi.spyOn(prisma.patient, "findMany").mockResolvedValue([] as never);

    await listPatients({
      clinicId: "clinic-1",
      query: "  ada  ",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { fullName: { contains: "ada", mode: "insensitive" } },
            { phone: { contains: "ada", mode: "insensitive" } },
            { email: { contains: "ada", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("omits the OR clause when query is empty or undefined", async () => {
    const findManySpy = vi.spyOn(prisma.patient, "findMany").mockResolvedValue([] as never);

    await listPatients({
      clinicId: "clinic-1",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
          archivedAt: null,
        },
      }),
    );

    await listPatients({
      clinicId: "clinic-1",
      query: "   ",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
          archivedAt: null,
        },
      }),
    );
  });

  it("applies pagination with cursor and over-fetch limit", async () => {
    const findManySpy = vi.spyOn(prisma.patient, "findMany").mockResolvedValue([
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
        _count: { sessions: 0 },
        archivedAt: null,
        createdAt: new Date("2026-04-17T11:00:00.000Z"),
        updatedAt: new Date("2026-04-17T11:00:00.000Z"),
      },
    ] as never);

    const result = await listPatients({
      clinicId: "clinic-1",
      limit: 5,
      cursor: "patient-1",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: "patient-1" },
        skip: 1,
        take: 6,
      }),
    );

    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns a nextCursor when more results exist than the limit", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `patient-${i + 1}`,
      fullName: `Patient ${i + 1}`,
      dateOfBirth: null,
      sex: null,
      phone: null,
      email: null,
      addressLine: null,
      conditionTags: [],
      sessions: [],
      _count: { sessions: 0 },
      archivedAt: null,
      createdAt: new Date("2026-04-17T10:00:00.000Z"),
      updatedAt: new Date("2026-04-17T10:00:00.000Z"),
    }));

    vi.spyOn(prisma.patient, "findMany").mockResolvedValue(rows as never);

    const result = await listPatients({
      clinicId: "clinic-1",
      limit: 5,
    });

    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBe("patient-5");
  });
});
