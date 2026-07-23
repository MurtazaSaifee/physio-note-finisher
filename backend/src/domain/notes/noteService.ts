import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import { PatientNotFoundError } from "../patients/patientService.js";
import { createAuditEvent } from "../audit/auditService.js";
import { resolveTemplateSnapshot } from "./templateService.js";
import type {
  CreateManualNoteRequest,
  NoteLifecycleResponse,
  ProgressNoteResponse,
  SaveManualNoteRequest,
  SoapSections,
} from "../../../../shared/contracts/notes.js";
import type { NoteStatus } from "../../../../shared/contracts/sessions.js";

export { PatientNotFoundError };

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

export class NoteNotFoundError extends Error {
  constructor() {
    super("Note not found");
    this.name = "NoteNotFoundError";
  }
}

export class NoteFinalizedError extends Error {
  constructor() {
    super("Note already finalized");
    this.name = "NoteFinalizedError";
  }
}

type SessionWithProgressNoteRow = Prisma.SessionGetPayload<{
  include: {
    progressNote: {
      select: {
        id: true;
        subjective: true;
        objective: true;
        assessment: true;
        plan: true;
        templateKey: true;
        templateSnapshotLabel: true;
        templateSnapshotCategories: true;
        templateSnapshotSource: true;
        templateApplyMode: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}>;

type ProgressNoteRow = Prisma.ProgressNoteGetPayload<{
  select: {
    id: true;
    subjective: true;
    objective: true;
    assessment: true;
    plan: true;
    templateKey: true;
    templateSnapshotLabel: true;
    templateSnapshotCategories: true;
    templateSnapshotSource: true;
    templateApplyMode: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

function normalizeSectionText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSections(sections: SoapSections): SoapSections {
  return {
    subjective: normalizeSectionText(sections.subjective),
    objective: normalizeSectionText(sections.objective),
    assessment: normalizeSectionText(sections.assessment),
    plan: normalizeSectionText(sections.plan),
  };
}

function renderFinalNote(sections: SoapSections): string {
  const normalized = normalizeSections(sections);

  return [
    ["Subjective", normalized.subjective],
    ["Objective", normalized.objective],
    ["Assessment", normalized.assessment],
    ["Plan", normalized.plan],
  ]
    .map(([label, value]) => `${label}:\n${value ?? ""}`)
    .join("\n\n")
    .trim();
}

function toResponse(
  session: {
    id: string;
    patientId: string;
    startedAt: Date;
    visitType: string;
    noteStatus: NoteStatus;
    patientSummary: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  note: ProgressNoteRow,
): ProgressNoteResponse {
  return {
    id: note.id,
    patientId: session.patientId,
    sessionId: session.id,
    startedAt: session.startedAt.toISOString(),
    visitType: session.visitType,
    noteStatus: session.noteStatus,
    patientSummary: session.patientSummary,
    sections: {
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
    },
    templateKey: note.templateKey as ProgressNoteResponse["templateKey"],
    templateProvenance: {
      templateLabel: note.templateSnapshotLabel ?? null,
      categoryLabels: note.templateSnapshotCategories ?? [],
      source: (note.templateSnapshotSource ?? null) as NonNullable<ProgressNoteResponse["templateProvenance"]>["source"],
      applyMode: (note.templateApplyMode ?? null) as NonNullable<ProgressNoteResponse["templateProvenance"]>["applyMode"],
    },
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function toLifecycleResponse(
  session: {
    id: string;
    patientId: string;
    startedAt: Date;
    visitType: string;
    noteStatus: NoteStatus;
    patientSummary: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  note: ProgressNoteRow,
): NoteLifecycleResponse {
  return toResponse(session, note);
}

async function ensurePatientExists(clinicId: string, patientId: string): Promise<void> {
  const patient = await prisma.patient.findFirst({
    where: {
      clinicId,
      id: patientId,
    },
    select: {
      id: true,
    },
  });

  if (!patient) {
    throw new PatientNotFoundError();
  }
}

async function findSessionWithNote(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
}): Promise<SessionWithProgressNoteRow> {
  const session = await prisma.session.findFirst({
    where: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      id: input.sessionId,
    },
    include: {
      progressNote: {
        select: {
          id: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          templateKey: true,
          templateSnapshotLabel: true,
          templateSnapshotCategories: true,
          templateSnapshotSource: true,
          templateApplyMode: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  if (!session.progressNote) {
    throw new NoteNotFoundError();
  }

  return session;
}

function requireProgressNote(session: SessionWithProgressNoteRow): ProgressNoteRow {
  if (!session.progressNote) {
    throw new NoteNotFoundError();
  }

  return session.progressNote;
}

function countChangedSections(
  before: SoapSections,
  after: SoapSections,
): { count: number; sectionName?: "subjective" | "objective" | "assessment" | "plan" | undefined } {
  const keys: ("subjective" | "objective" | "assessment" | "plan")[] = [
    "subjective",
    "objective",
    "assessment",
    "plan",
  ];
  let count = 0;
  let changedSection: typeof keys[number] | undefined;

  for (const key of keys) {
    if (before[key] !== after[key]) {
      count++;
      changedSection = key;
    }
  }

  return { count, sectionName: count === 1 ? changedSection : undefined };
}

function noteUpdateData(input: SaveManualNoteRequest | CreateManualNoteRequest) {
  const sections = normalizeSections(input.sections);

  return {
    subjective: sections.subjective,
    objective: sections.objective,
    assessment: sections.assessment,
    plan: sections.plan,
    ...(input.templateKey !== undefined ? { templateKey: input.templateKey } : {}),
  };
}

function provenanceSnapshotData(
  snapshot: Awaited<ReturnType<typeof resolveTemplateSnapshot>>,
) {
  return {
    templateSnapshotLabel: snapshot.templateLabel,
    templateSnapshotCategories: snapshot.categoryLabels,
    templateSnapshotSource: snapshot.source,
    templateApplyMode: snapshot.applyMode,
  };
}

async function updateSessionFinalNote(input: {
  clinicId: string;
  sessionId: string;
  noteStatus?: NoteStatus;
  sections: SoapSections;
  snapshot?: Awaited<ReturnType<typeof resolveTemplateSnapshot>>;
}): Promise<{
  id: string;
  patientId: string;
  startedAt: Date;
  visitType: string;
  noteStatus: NoteStatus;
  patientSummary: string | null;
  createdAt: Date;
  updatedAt: Date;
}> {
  return prisma.session.update({
    where: {
      id_clinicId: {
        id: input.sessionId,
        clinicId: input.clinicId,
      },
    },
    data: {
      ...(input.noteStatus !== undefined ? { noteStatus: input.noteStatus } : {}),
      finalNote: renderFinalNote(input.sections),
      ...(input.snapshot
        ? {
            activeTemplateSnapshotLabel: input.snapshot.templateLabel,
            activeTemplateSnapshotCategories: input.snapshot.categoryLabels,
            activeTemplateSnapshotSource: input.snapshot.source,
            activeTemplateApplyMode: input.snapshot.applyMode,
          }
        : {}),
    },
    select: {
      id: true,
      patientId: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
      patientSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createManualNote(input: {
  clinicId: string;
  patientId: string;
  userId: string;
  input: CreateManualNoteRequest;
}): Promise<ProgressNoteResponse> {
  await ensurePatientExists(input.clinicId, input.patientId);

  const sections = normalizeSections(input.input.sections);
  const snapshot = await resolveTemplateSnapshot({
    clinicId: input.clinicId,
    userId: input.userId,
    templateKey: input.input.templateKey ?? null,
    applyMode: input.input.templateApplyMode ?? null,
  });

  const [session, note] = await prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        clinic: {
          connect: {
            id: input.clinicId,
          },
        },
        patient: {
          connect: {
            id_clinicId: {
              id: input.patientId,
              clinicId: input.clinicId,
            },
          },
        },
        startedAt: new Date(input.input.startedAt),
        visitType: input.input.visitType.trim(),
        noteStatus: "draft",
        finalNote: renderFinalNote(sections),
        activeTemplateSnapshotLabel: snapshot.templateLabel,
        activeTemplateSnapshotCategories: snapshot.categoryLabels,
        activeTemplateSnapshotSource: snapshot.source,
        activeTemplateApplyMode: snapshot.applyMode,
      },
      select: {
        id: true,
        patientId: true,
        startedAt: true,
        visitType: true,
        noteStatus: true,
        patientSummary: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const note = await tx.progressNote.create({
      data: {
        clinic: {
          connect: {
            id: input.clinicId,
          },
        },
        patient: {
          connect: {
            id_clinicId: {
              id: input.patientId,
              clinicId: input.clinicId,
            },
          },
        },
        session: {
          connect: {
            id_clinicId: {
              id: session.id,
              clinicId: input.clinicId,
            },
          },
        },
        subjective: sections.subjective,
        objective: sections.objective,
        assessment: sections.assessment,
        plan: sections.plan,
        templateKey: input.input.templateKey ?? null,
        ...provenanceSnapshotData(snapshot),
      },
      select: {
        id: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        templateKey: true,
        templateSnapshotLabel: true,
        templateSnapshotCategories: true,
        templateSnapshotSource: true,
        templateApplyMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return [session, note];
  });

  await createAuditEvent({
    eventType: "noteCreated",
    sessionId: session.id,
    userId: input.userId,
    clinicId: input.clinicId,
  });

  return toResponse(session, note);
}

export async function createNoteForExistingSession(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
  userId: string;
  sections: SoapSections;
  templateKey?: string | null;
  templateApplyMode?: "fillBlank" | "replaceAll" | null;
}): Promise<ProgressNoteResponse> {
  const session = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      clinicId: input.clinicId,
      patientId: input.patientId,
    },
    select: {
      id: true,
      patientId: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
      patientSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  const sections = normalizeSections(input.sections);
  const snapshot = await resolveTemplateSnapshot({
    clinicId: input.clinicId,
    userId: input.userId,
    templateKey: input.templateKey ?? null,
    applyMode: input.templateApplyMode ?? null,
  });

  const [note, updatedSession] = await prisma.$transaction(async (tx) => {
    const note = await tx.progressNote.create({
      data: {
        clinic: {
          connect: {
            id: input.clinicId,
          },
        },
        patient: {
          connect: {
            id_clinicId: {
              id: input.patientId,
              clinicId: input.clinicId,
            },
          },
        },
        session: {
          connect: {
            id_clinicId: {
              id: input.sessionId,
              clinicId: input.clinicId,
            },
          },
        },
        subjective: sections.subjective,
        objective: sections.objective,
        assessment: sections.assessment,
        plan: sections.plan,
        templateKey: input.templateKey ?? null,
        ...provenanceSnapshotData(snapshot),
      },
      select: {
        id: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        templateKey: true,
        templateSnapshotLabel: true,
        templateSnapshotCategories: true,
        templateSnapshotSource: true,
        templateApplyMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const updatedSession = await tx.session.update({
      where: {
        id_clinicId: {
          id: input.sessionId,
          clinicId: input.clinicId,
        },
      },
      data: {
        finalNote: renderFinalNote(sections),
        activeTemplateSnapshotLabel: snapshot.templateLabel,
        activeTemplateSnapshotCategories: snapshot.categoryLabels,
        activeTemplateSnapshotSource: snapshot.source,
        activeTemplateApplyMode: snapshot.applyMode,
      },
      select: {
        id: true,
        patientId: true,
        startedAt: true,
        visitType: true,
        noteStatus: true,
        patientSummary: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return [note, updatedSession];
  });

  await createAuditEvent({
    eventType: "noteCreated",
    sessionId: input.sessionId,
    userId: input.userId,
    clinicId: input.clinicId,
  });

  return toResponse(updatedSession, note);
}

export async function getManualNote(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
}): Promise<ProgressNoteResponse> {
  const session = await findSessionWithNote(input);

  return toResponse(session, requireProgressNote(session));
}

export async function saveManualNote(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
  userId: string;
  input: SaveManualNoteRequest;
}): Promise<ProgressNoteResponse> {
  const session = await prisma.session.findFirst({
    where: {
      id: input.sessionId,
      clinicId: input.clinicId,
      patientId: input.patientId,
    },
    include: {
      progressNote: {
        select: {
          id: true,
          subjective: true,
          objective: true,
          assessment: true,
          plan: true,
          templateKey: true,
          templateSnapshotLabel: true,
          templateSnapshotCategories: true,
          templateSnapshotSource: true,
          templateApplyMode: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  if (session.noteStatus === "finalized") {
    throw new NoteFinalizedError();
  }

  if (!session.progressNote) {
    return createNoteForExistingSession({
      clinicId: input.clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      userId: input.userId,
      sections: input.input.sections,
      templateKey: input.input.templateKey ?? null,
      templateApplyMode: input.input.templateApplyMode ?? null,
    });
  }

  const existingNote = requireProgressNote(session);
  const effectiveTemplateKey =
    input.input.templateKey !== undefined
      ? input.input.templateKey
      : existingNote.templateKey;
  const effectiveApplyMode =
    input.input.templateApplyMode !== undefined
      ? input.input.templateApplyMode
      : (existingNote.templateApplyMode as "fillBlank" | "replaceAll" | null);
  const snapshot = await resolveTemplateSnapshot({
    clinicId: input.clinicId,
    userId: input.userId,
    templateKey: effectiveTemplateKey,
    applyMode: effectiveApplyMode,
  });

  const beforeSections: SoapSections = {
    subjective: existingNote.subjective,
    objective: existingNote.objective,
    assessment: existingNote.assessment,
    plan: existingNote.plan,
  };

  const note = await prisma.progressNote.update({
    where: {
      id_clinicId: {
        id: existingNote.id,
        clinicId: input.clinicId,
      },
    },
    data: {
      ...noteUpdateData(input.input),
      ...provenanceSnapshotData(snapshot),
    },
    select: {
      id: true,
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      templateKey: true,
      templateSnapshotLabel: true,
      templateSnapshotCategories: true,
      templateSnapshotSource: true,
      templateApplyMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const updatedSession = await updateSessionFinalNote({
    clinicId: input.clinicId,
    sessionId: input.sessionId,
    sections: {
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
    },
    snapshot,
  });

  const afterSections: SoapSections = {
    subjective: note.subjective,
    objective: note.objective,
    assessment: note.assessment,
    plan: note.plan,
  };
  const changed = countChangedSections(beforeSections, afterSections);

  await createAuditEvent({
    eventType: "sectionEdited",
    sessionId: input.sessionId,
    userId: input.userId,
    clinicId: input.clinicId,
    metadata: changed.count === 1 && changed.sectionName
      ? { sectionName: changed.sectionName }
      : {},
  });

  return toResponse(updatedSession, note);
}

export async function finalizeManualNote(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
  userId: string;
}): Promise<NoteLifecycleResponse> {
  const session = await findSessionWithNote(input);

  if (session.noteStatus === "finalized") {
    throw new NoteFinalizedError();
  }

  const note = requireProgressNote(session);
  const updatedSession = await updateSessionFinalNote({
    clinicId: input.clinicId,
    sessionId: input.sessionId,
    noteStatus: "finalized",
    sections: {
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
    },
  });

  await prisma.appointment.updateMany({
    where: {
      clinicId: input.clinicId,
      linkedSessionId: input.sessionId,
      status: "upcoming",
    },
    data: {
      status: "completed",
    },
  });

  await createAuditEvent({
    eventType: "noteFinalized",
    sessionId: input.sessionId,
    userId: input.userId,
    clinicId: input.clinicId,
  });

  return toLifecycleResponse(updatedSession, note);
}

export async function reopenManualNote(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
  userId: string;
}): Promise<NoteLifecycleResponse> {
  const session = await findSessionWithNote(input);
  const note = requireProgressNote(session);

  const updatedSession = await updateSessionFinalNote({
    clinicId: input.clinicId,
    sessionId: input.sessionId,
    noteStatus: "reopened",
    sections: {
      subjective: note.subjective,
      objective: note.objective,
      assessment: note.assessment,
      plan: note.plan,
    },
  });

  await createAuditEvent({
    eventType: "noteReopened",
    sessionId: input.sessionId,
    userId: input.userId,
    clinicId: input.clinicId,
  });

  return toLifecycleResponse(updatedSession, note);
}
