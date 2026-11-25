import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import { listDashboardSessions } from "../../src/domain/dashboard/dashboardService.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dashboard search payload", () => {
  it("pushes search and pagination into the database query", async () => {
    const findManySpy = vi.spyOn(prisma.session, "findMany").mockResolvedValue([
      {
        id: "session-2",
        patientId: "patient-2",
        startedAt: new Date("2026-04-25T09:00:00.000Z"),
        visitType: "reassessment",
        noteStatus: "finalized",
        finalNote: "Spine alignment stable.",
        patientSummary: "Maintain posture awareness.",
        patient: {
          fullName: "Grace Hopper",
          conditionTags: ["Spine"],
        },
        progressNote: {
          templateKey: null,
        },
      },
    ] as never);
    const countSpy = vi.spyOn(prisma.session, "count").mockResolvedValue(1);
    vi.spyOn(prisma.appointment, "findFirst").mockResolvedValue(null);

    const result = await listDashboardSessions({
      clinicId: "clinic-1",
      filters: {
        noteStatus: "finalized",
        search: "spine",
        page: 1,
        pageSize: 1,
      },
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              clinicId: "clinic-1",
              noteStatus: "finalized",
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  patient: {
                    fullName: {
                      contains: "spine",
                      mode: "insensitive",
                    },
                  },
                }),
              ]),
            }),
          ]),
        }),
        skip: 0,
        take: 1,
        select: expect.objectContaining({
          finalNote: true,
          patientSummary: true,
          patient: {
            select: {
              fullName: true,
              conditionTags: true,
            },
          },
        }),
      }),
    );
    expect(countSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.any(Array),
        }),
      }),
    );
    expect(result.recentSessions).toEqual([
      {
        sessionId: "session-2",
        patientId: "patient-2",
        patientName: "Grace Hopper",
        sessionDate: "2026-04-25T09:00:00.000Z",
        visitType: "reassessment",
        noteStatus: "finalized",
        templateKey: null,
        finalNote: "Spine alignment stable.",
        patientSummary: "Maintain posture awareness.",
        conditionTags: ["Spine"],
      },
    ]);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.filters).toEqual({
      noteStatus: "finalized",
      search: "spine",
      page: 1,
      pageSize: 1,
    });
  });
});
