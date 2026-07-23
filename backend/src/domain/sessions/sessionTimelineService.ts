import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import { PatientNotFoundError } from "../patients/patientService.js";
import type {
  CreateSessionEntryRequest,
  PatientTimelineResponse,
  PriorSessionDetailResponse,
  SessionTimelineItem,
} from "../../../../shared/contracts/sessions.js";

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

type SessionRow = Prisma.SessionGetPayload<{
  select: {
    id: true;
    clinicId: true;
    patientId: true;
    startedAt: true;
    visitType: true;
    noteStatus: true;
    finalNote: true;
    patientSummary: true;
    priorPlan: true;
    carryForwardContext: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

const MAX_PREVIEW_LENGTH = 140;

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid startedAt value");
  }

  return parsed;
}

function previewText(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= MAX_PREVIEW_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
}

function toTimelineItem(row: SessionRow): SessionTimelineItem {
  return {
    id: row.id,
    patientId: row.patientId,
    sessionDate: row.startedAt.toISOString(),
    visitType: row.visitType,
    noteStatus: row.noteStatus,
    finalNotePreview: previewText(row.finalNote),
    patientSummaryPreview: previewText(row.patientSummary),
  };
}

function toDetail(row: SessionRow): PriorSessionDetailResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    sessionDate: row.startedAt.toISOString(),
    visitType: row.visitType,
    noteStatus: row.noteStatus,
    finalNote: row.finalNote,
    patientSummary: row.patientSummary,
    priorPlan: row.priorPlan,
    carryForwardContext: row.carryForwardContext,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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

export async function createSessionEntry(input: {
  clinicId: string;
  patientId: string;
  input: CreateSessionEntryRequest;
}): Promise<PriorSessionDetailResponse> {
  await ensurePatientExists(input.clinicId, input.patientId);

  const session = await prisma.session.create({
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
      startedAt: parseIsoDate(input.input.startedAt),
      visitType: input.input.visitType.trim(),
      noteStatus: input.input.noteStatus,
      finalNote: normalizeText(input.input.finalNote),
      patientSummary: normalizeText(input.input.patientSummary),
      priorPlan: normalizeText(input.input.priorPlan),
      carryForwardContext: normalizeText(input.input.carryForwardContext),
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
      finalNote: true,
      patientSummary: true,
      priorPlan: true,
      carryForwardContext: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toDetail(session);
}

export async function listPatientTimeline(input: {
  clinicId: string;
  patientId: string;
}): Promise<PatientTimelineResponse> {
  await ensurePatientExists(input.clinicId, input.patientId);

  const sessions = await prisma.session.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: input.patientId,
    },
    orderBy: {
      startedAt: "desc",
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
      finalNote: true,
      patientSummary: true,
      priorPlan: true,
      carryForwardContext: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    patientId: input.patientId,
    items: sessions.map(toTimelineItem),
  };
}

export async function getPriorSessionDetail(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
}): Promise<PriorSessionDetailResponse> {
  await ensurePatientExists(input.clinicId, input.patientId);

  const session = await prisma.session.findFirst({
    where: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      id: input.sessionId,
    },
    select: {
      id: true,
      clinicId: true,
      patientId: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
      finalNote: true,
      patientSummary: true,
      priorPlan: true,
      carryForwardContext: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!session) {
    throw new SessionNotFoundError();
  }

  return toDetail(session);
}
