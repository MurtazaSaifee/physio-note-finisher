import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  buildDateRange,
  buildWhere,
  listDashboardSessions,
} from "../../src/domain/dashboard/dashboardService.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dashboardService", () => {
  it("applies clinic-scoped filters and omits raw SOAP sections", async () => {
    const findManySpy = vi.spyOn(prisma.session, "findMany").mockResolvedValue([
      {
        id: "session-1",
        patientId: "patient-1",
        startedAt: new Date("2026-04-26T09:00:00.000Z"),
        visitType: "follow-up",
        noteStatus: "draft",
        patient: {
          fullName: "Ada Lovelace",
        },
        progressNote: {
          templateKey: "post-op-knee",
        },
      },
    ] as never);
    vi.spyOn(prisma.session, "count").mockResolvedValue(1);
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    await listDashboardSessions({
      clinicId: "clinic-1",
      filters: {
        date: "2026-04-26",
        patientId: "patient-1",
        noteStatus: "draft",
        page: 1,
        pageSize: 10,
      },
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
          patientId: "patient-1",
          noteStatus: "draft",
        }),
      }),
    );
    expect(findManySpy.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          progressNote: {
            select: {
              templateKey: true,
            },
          },
        }),
      }),
    );
    expect(findManySpy.mock.calls[0]?.[0]).not.toEqual(
      expect.objectContaining({
        select: expect.objectContaining({
          progressNote: expect.objectContaining({
            select: expect.objectContaining({
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
            }),
          }),
        }),
      }),
    );
  });

  describe("buildDateRange", () => {
    it("returns a 24-hour range for a valid date string", () => {
      const result = buildDateRange("2026-04-26", "+05:30");
      expect(result.gte.toISOString()).toBe("2026-04-25T18:30:00.000Z");
      expect(result.lt.toISOString()).toBe("2026-04-26T18:30:00.000Z");
    });

    it("defaults to +05:30 when no timezone offset is provided", () => {
      const result = buildDateRange("2026-04-26");
      expect(result.gte.toISOString()).toBe("2026-04-25T18:30:00.000Z");
      expect(result.lt.toISOString()).toBe("2026-04-26T18:30:00.000Z");
    });

    it("throws for invalid date formats", () => {
      expect(() => buildDateRange("04-26-2026")).toThrow(
        "Invalid date format, expected YYYY-MM-DD",
      );
      expect(() => buildDateRange("2026/04/26")).toThrow(
        "Invalid date format, expected YYYY-MM-DD",
      );
    });
  });

  describe("buildWhere", () => {
    it("includes clinicId and optional patientId", () => {
      const where = buildWhere({
        clinicId: "clinic-1",
        filters: {},
      });
      expect(where).toEqual({ clinicId: "clinic-1" });

      const whereWithPatient = buildWhere({
        clinicId: "clinic-1",
        filters: { patientId: "patient-1" },
      });
      expect(whereWithPatient).toEqual({
        clinicId: "clinic-1",
        patientId: "patient-1",
      });
    });

    it("adds startedAt range when date is provided", () => {
      const where = buildWhere({
        clinicId: "clinic-1",
        filters: { date: "2026-04-26" },
      });
      expect(where).toEqual({
        clinicId: "clinic-1",
        startedAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      });
    });

    it("adds noteStatus filter when provided and not 'all'", () => {
      const where = buildWhere({
        clinicId: "clinic-1",
        filters: { noteStatus: "draft" },
      });
      expect(where).toEqual({
        clinicId: "clinic-1",
        noteStatus: "draft",
      });
    });

    it("omits noteStatus filter when value is 'all'", () => {
      const where = buildWhere({
        clinicId: "clinic-1",
        filters: { noteStatus: "all" },
      });
      expect(where).toEqual({ clinicId: "clinic-1" });
    });
  });

  it("queries dashboard sessions in descending date order", async () => {
    const findManySpy = vi
      .spyOn(prisma.session, "findMany")
      .mockResolvedValue([] as never);
    const countSpy = vi.spyOn(prisma.session, "count").mockResolvedValue(0);
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    await listDashboardSessions({
      clinicId: "clinic-1",
      filters: {},
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          startedAt: "desc",
        },
        skip: 0,
        take: 10,
      }),
    );
    expect(countSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clinicId: "clinic-1",
        }),
      }),
    );
  });

  it("returns pagination metadata based on page and page size", async () => {
    vi.spyOn(prisma.session, "findMany").mockResolvedValue([
      {
        id: "session-3",
        patientId: "patient-3",
        startedAt: new Date("2026-04-24T09:00:00.000Z"),
        visitType: "follow-up",
        noteStatus: "finalized",
        finalNote: "Three",
        patientSummary: "Three summary",
        patient: {
          fullName: "Alan Turing",
          conditionTags: ["hip"],
        },
        progressNote: {
          templateKey: null,
        },
      },
    ] as never);
    vi.spyOn(prisma.session, "count").mockResolvedValue(3);
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    const result = await listDashboardSessions({
      clinicId: "clinic-1",
      filters: { page: 2, pageSize: 2 },
    });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(2);
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.recentSessions).toHaveLength(1);
    expect(result.recentSessions[0]?.sessionId).toBe("session-3");
  });
});
