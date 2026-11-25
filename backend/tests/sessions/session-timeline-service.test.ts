import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  SessionNotFoundError,
  createSessionEntry,
  getPriorSessionDetail,
  listPatientTimeline,
} from "../../src/domain/sessions/sessionTimelineService.js";
import { PatientNotFoundError } from "../../src/domain/patients/patientService.js";

const patientRow = { id: "patient-1" };

const sessionRow = {
  id: "session-1",
  clinicId: "clinic-1",
  patientId: "patient-1",
  startedAt: new Date("2026-04-17T12:34:56.000Z"),
  visitType: "follow-up",
  noteStatus: "finalized" as const,
  finalNote: [
    "Subjective: Pain with stairs",
    "Objective: Mild swelling",
    "Assessment: Improving strength",
    "Plan: Continue progressive loading",
  ].join("\n\n"),
  patientSummary: "B".repeat(150),
  priorPlan: "prior plan text",
  carryForwardContext: "carry forward context",
  createdAt: new Date("2026-04-17T12:40:00.000Z"),
  updatedAt: new Date("2026-04-17T12:40:00.000Z"),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionTimelineService", () => {
  it("creates a session entry after verifying the clinic-scoped patient", async () => {
    const patientFindSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue(patientRow as never);
    const createSpy = vi
      .spyOn(prisma.session, "create")
      .mockResolvedValue(sessionRow as never);

    const result = await createSessionEntry({
      clinicId: "clinic-1",
      patientId: "patient-1",
      input: {
        startedAt: "2026-04-17T12:34:56.000Z",
        visitType: "follow-up",
        noteStatus: "finalized",
        finalNote: "A".repeat(150),
        patientSummary: "B".repeat(150),
        priorPlan: "prior plan text",
        carryForwardContext: "carry forward context",
      },
    });

    expect(patientFindSpy).toHaveBeenCalledWith({
      where: {
        clinicId: "clinic-1",
        id: "patient-1",
      },
      select: {
        id: true,
      },
    });
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visitType: "follow-up",
          noteStatus: "finalized",
        }),
      }),
    );
    expect(result.id).toBe("session-1");
    expect(result.noteStatus).toBe("finalized");
  });

  it("lists patient timeline in reverse chronological order with trimmed previews", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    const findManySpy = vi.spyOn(prisma.session, "findMany").mockResolvedValue([
      sessionRow,
      {
        ...sessionRow,
        id: "session-2",
        startedAt: new Date("2026-04-18T12:34:56.000Z"),
        finalNote: "short note",
        patientSummary: "summary",
      },
    ] as never);

    const result = await listPatientTimeline({
      clinicId: "clinic-1",
      patientId: "patient-1",
    });

    expect(findManySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          startedAt: "desc",
        },
      }),
    );
    expect(result.items[0].sessionDate).toBe("2026-04-17T12:34:56.000Z");
    expect(result.items[0].finalNotePreview).toContain("Subjective: Pain with stairs");
    expect(result.items[0].patientSummaryPreview).toBe(`${"B".repeat(137)}...`);
  });

  it("opens prior session detail for same-clinic records", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(sessionRow as never);

    const result = await getPriorSessionDetail({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
    });

    expect(result.id).toBe("session-1");
    expect(result.finalNote).toBe(sessionRow.finalNote);
  });

  it("throws for missing patient or session records", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(null);

    await expect(
      createSessionEntry({
        clinicId: "clinic-1",
        patientId: "missing",
        input: {
          startedAt: "2026-04-17T12:34:56.000Z",
          visitType: "follow-up",
          noteStatus: "draft",
        },
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);

    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(null);

    await expect(
      getPriorSessionDetail({
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "missing",
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });
});
