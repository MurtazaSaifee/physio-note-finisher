import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/data/prismaClient.js";
import {
  NoteFinalizedError,
  NoteNotFoundError,
  createManualNote,
  finalizeManualNote,
  getManualNote,
  SessionNotFoundError,
  reopenManualNote,
  saveManualNote,
} from "../../src/domain/notes/noteService.js";
import { PatientNotFoundError } from "../../src/domain/patients/patientService.js";

const patientRow = {
  id: "patient-1",
};

const baseStartedAt = new Date("2026-04-17T12:34:56.000Z");
const baseCreatedAt = new Date("2026-04-17T12:40:00.000Z");

const createInput = {
  startedAt: "2026-04-17T12:34:56.000Z",
  visitType: "follow-up",
  sections: {
    subjective: "Pain with stairs",
    objective: "Mild swelling",
    assessment: "Improving strength",
    plan: "Continue progressive loading",
  },
  templateKey: "knee" as const,
};

const existingSections = {
  subjective: "Pain with stairs",
  objective: "Mild swelling",
  assessment: "Improving strength",
  plan: "Continue progressive loading",
};

const updatedSections = {
  subjective: "Pain with stairs",
  objective: "Improved knee extension",
  assessment: "Improving strength",
  plan: "Continue progressive loading",
};

function createSessionRow(noteStatus: "draft" | "finalized" | "reopened") {
  return {
    id: "session-1",
    patientId: "patient-1",
    startedAt: baseStartedAt,
    visitType: "follow-up",
    noteStatus,
    patientSummary: null,
    createdAt: baseCreatedAt,
    updatedAt: baseCreatedAt,
  };
}

function createProgressNoteRow(sections = existingSections) {
  return {
    id: "note-1",
    subjective: sections.subjective,
    objective: sections.objective,
    assessment: sections.assessment,
    plan: sections.plan,
    templateKey: "knee" as const,
    createdAt: baseCreatedAt,
    updatedAt: baseCreatedAt,
  };
}

beforeEach(() => {
  vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
    return callback(prisma);
  });
  vi.spyOn(prisma.customTemplate, "findFirst").mockResolvedValue(null);
  vi.spyOn(prisma.appointment, "updateMany").mockResolvedValue({ count: 0 } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("noteService", () => {
  it("returns the session's persisted patient summary when reading a note", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      ...createSessionRow("draft"),
      patientSummary: "Continue the agreed home exercise plan.",
      progressNote: createProgressNoteRow(existingSections),
    } as never);

    const result = await getManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
    });

    expect(result.patientSummary).toBe("Continue the agreed home exercise plan.");
  });

  it("creates a draft manual note with a clinic-scoped session and progress note", async () => {
    const patientFindSpy = vi
      .spyOn(prisma.patient, "findFirst")
      .mockResolvedValue(patientRow as never);
    const sessionCreateSpy = vi
      .spyOn(prisma.session, "create")
      .mockResolvedValue(createSessionRow("draft") as never);
    const noteCreateSpy = vi
      .spyOn(prisma.progressNote, "create")
      .mockResolvedValue(createProgressNoteRow() as never);
    vi.spyOn(prisma.auditEvent, "create").mockResolvedValue({} as never);

    const result = await createManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      userId: "user-1",
      input: createInput,
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
    expect(sessionCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          noteStatus: "draft",
          finalNote: expect.stringContaining("Subjective:\nPain with stairs"),
        }),
      }),
    );
    expect(noteCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          objective: "Mild swelling",
          templateKey: "knee",
        }),
      }),
    );
    expect(result.noteStatus).toBe("draft");
    expect(result.sections).toEqual(createInput.sections);
    expect(result.startedAt).toBe("2026-04-17T12:34:56.000Z");
    expect(result.visitType).toBe("follow-up");
  });

  it("creates a progress note on first save for an existing session without one", async () => {
    const sessionFindSpy = vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      ...createSessionRow("draft"),
      progressNote: null,
    } as never);
    const noteCreateSpy = vi.spyOn(prisma.progressNote, "create").mockResolvedValue(
      createProgressNoteRow({
        subjective: null,
        objective: null,
        assessment: null,
        plan: null,
      } as never) as never,
    );
    const sessionUpdateSpy = vi.spyOn(prisma.session, "update").mockResolvedValue({
      ...createSessionRow("draft"),
      noteStatus: "draft",
    } as never);
    vi.spyOn(prisma.auditEvent, "create").mockResolvedValue({} as never);

    const result = await saveManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      userId: "user-1",
      input: {
        sections: {
          subjective: null,
          objective: null,
          assessment: null,
          plan: null,
        },
        templateKey: "knee",
      },
    });

    expect(sessionFindSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
          patientId: "patient-1",
          id: "session-1",
        },
      }),
    );
    expect(noteCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateKey: "knee",
        }),
      }),
    );
    expect(sessionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalNote: expect.stringContaining("Subjective:\n"),
        }),
      }),
    );
    expect(result.sessionId).toBe("session-1");
    expect(result.noteStatus).toBe("draft");
  });

  it("saves only the requested SOAP section values without touching unrelated text", async () => {
    const sessionFindSpy = vi
      .spyOn(prisma.session, "findFirst")
      .mockResolvedValue({
        ...createSessionRow("draft"),
        progressNote: createProgressNoteRow(existingSections),
      } as never);
    const noteUpdateSpy = vi
      .spyOn(prisma.progressNote, "update")
      .mockResolvedValue(createProgressNoteRow(updatedSections) as never);
    const sessionUpdateSpy = vi
      .spyOn(prisma.session, "update")
      .mockResolvedValue({
        ...createSessionRow("draft"),
        noteStatus: "draft",
      } as never);

    vi.spyOn(prisma.auditEvent, "create").mockResolvedValue({} as never);

    const result = await saveManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      userId: "user-1",
      input: {
        sections: updatedSections,
        templateKey: "knee",
      },
    });

    expect(sessionFindSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clinicId: "clinic-1",
          patientId: "patient-1",
          id: "session-1",
        },
      }),
    );
    expect(noteUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          objective: "Improved knee extension",
          subjective: "Pain with stairs",
        }),
      }),
    );
    expect(sessionUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          finalNote: expect.stringContaining("Objective:\nImproved knee extension"),
        }),
      }),
    );
    expect(result.sections.objective).toBe("Improved knee extension");
    expect(result.sections.subjective).toBe("Pain with stairs");
  });

  it("rejects save attempts on finalized sessions", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      ...createSessionRow("finalized"),
      progressNote: createProgressNoteRow(existingSections),
    } as never);

    await expect(
      saveManualNote({
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        userId: "user-1",
        input: {
          sections: updatedSections,
        },
      }),
    ).rejects.toBeInstanceOf(NoteFinalizedError);
  });

  it("finalizes and reopens a note through explicit lifecycle calls only", async () => {
    vi.spyOn(prisma.session, "findFirst")
      .mockResolvedValueOnce({
        ...createSessionRow("draft"),
        progressNote: createProgressNoteRow(existingSections),
      } as never)
      .mockResolvedValueOnce({
        ...createSessionRow("finalized"),
        progressNote: createProgressNoteRow(existingSections),
      } as never);

    const sessionUpdateSpy = vi
      .spyOn(prisma.session, "update")
      .mockResolvedValueOnce({
        ...createSessionRow("finalized"),
        noteStatus: "finalized",
      } as never)
      .mockResolvedValueOnce({
        ...createSessionRow("reopened"),
        noteStatus: "reopened",
      } as never);
    vi.spyOn(prisma.auditEvent, "create").mockResolvedValue({} as never);

    const finalized = await finalizeManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      userId: "user-1",
    });
    const reopened = await reopenManualNote({
      clinicId: "clinic-1",
      patientId: "patient-1",
      sessionId: "session-1",
      userId: "user-1",
    });

    expect(sessionUpdateSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          noteStatus: "finalized",
        }),
      }),
    );
    expect(sessionUpdateSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          noteStatus: "reopened",
        }),
      }),
    );
    expect(finalized.noteStatus).toBe("finalized");
    expect(reopened.noteStatus).toBe("reopened");
  });

  it("throws when patient or session records are missing", async () => {
    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(null);

    await expect(
      createManualNote({
        clinicId: "clinic-1",
        patientId: "missing",
        userId: "user-1",
        input: createInput,
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);

    vi.spyOn(prisma.patient, "findFirst").mockResolvedValue(patientRow as never);
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue(null);

    await expect(
      saveManualNote({
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "missing",
        userId: "user-1",
        input: {
          sections: updatedSections,
        },
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it("throws when a note is missing for an existing session", async () => {
    vi.spyOn(prisma.session, "findFirst").mockResolvedValue({
      ...createSessionRow("draft"),
      progressNote: null,
    } as never);

    await expect(
      finalizeManualNote({
        clinicId: "clinic-1",
        patientId: "patient-1",
        sessionId: "session-1",
        userId: "user-1",
      }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});
