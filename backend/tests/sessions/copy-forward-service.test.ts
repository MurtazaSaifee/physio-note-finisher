import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  copyForwardFromSession,
  SessionNotFoundError,
} from "../../src/domain/sessions/copyForwardService.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("copyForwardService", () => {
  it("returns a scaffold with selected sections on successful copy-forward", async () => {
    const findFirstSpy = vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      startedAt: new Date("2026-04-17T12:34:56.000Z"),
      priorPlan: "prior plan text",
      carryForwardContext: "carry forward context",
    } as never);

    const result = await copyForwardFromSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan", "carryForwardContext"],
    });

    expect(findFirstSpy).toHaveBeenCalledWith({
      where: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        id: "session-1",
      },
      select: {
        id: true,
        clinicId: true,
        patientId: true,
        startedAt: true,
        priorPlan: true,
        carryForwardContext: true,
      },
    });
    expect(result).toEqual({
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan", "carryForwardContext"],
      priorPlan: "prior plan text",
      carryForwardContext: "carry forward context",
      sourceSessionDate: "2026-04-17T12:34:56.000Z",
    });
  });

  it("throws SessionNotFoundError when the source session does not exist", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(null);

    await expect(
      copyForwardFromSession({
        clinicId: "clinic-1",
        patientId: "patient-1",
        sourceSessionId: "missing-session",
        selectedSections: ["priorPlan"],
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("blocks cross-clinic access even when session id exists elsewhere", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(null);

    await expect(
      copyForwardFromSession({
        clinicId: "clinic-2",
        patientId: "patient-1",
        sourceSessionId: "session-1",
        selectedSections: ["priorPlan"],
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("preserves null values for unselected sections", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      startedAt: new Date("2026-04-17T12:34:56.000Z"),
      priorPlan: "prior plan text",
      carryForwardContext: null,
    } as never);

    const result = await copyForwardFromSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
    });

    expect(result.priorPlan).toBe("prior plan text");
    expect(result.carryForwardContext).toBeNull();
  });

  it("preserves null values for selected sections that are null in the source", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      id: "session-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      startedAt: new Date("2026-04-17T12:34:56.000Z"),
      priorPlan: null,
      carryForwardContext: "carry forward context",
    } as never);

    const result = await copyForwardFromSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sourceSessionId: "session-1",
      selectedSections: ["priorPlan"],
    });

    expect(result.priorPlan).toBeNull();
  });
});
