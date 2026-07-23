import { Prisma } from "@prisma/client";

import { prisma } from "../../data/prismaClient.js";
import type {
  CreatePatientRequest,
  ListPatientsResponse,
  PatientListItem,
  PatientProfileResponse,
  PatientRecord,
  RecentSessionStatus,
  UpdatePatientRequest,
} from "../../../../shared/contracts/patients.js";

export class PatientNotFoundError extends Error {
  constructor() {
    super("Patient not found");
    this.name = "PatientNotFoundError";
  }
}

function patientWorkspaceSelect(clinicId: string) {
  return {
    conditionTags: true,
    sessions: {
      where: {
        clinicId,
      },
      orderBy: {
        startedAt: "desc",
      },
      take: 1,
      select: {
        startedAt: true,
        noteStatus: true,
      },
    },
    _count: {
      select: {
        sessions: {
          where: {
            clinicId,
            noteStatus: {
              in: ["draft", "reopened"],
            },
          },
        },
      },
    },
  } satisfies Prisma.PatientSelect;
}

function patientRecordSelect(clinicId: string) {
  return {
    id: true,
    clinicId: true,
    fullName: true,
    dateOfBirth: true,
    sex: true,
    phone: true,
    email: true,
    addressLine: true,
    clinicalNotes: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    ...patientWorkspaceSelect(clinicId),
  } satisfies Prisma.PatientSelect;
}

function patientListSelect(clinicId: string) {
  return {
    id: true,
    fullName: true,
    dateOfBirth: true,
    sex: true,
    phone: true,
    email: true,
    addressLine: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    ...patientWorkspaceSelect(clinicId),
  } satisfies Prisma.PatientSelect;
}

function patientProfileSelect(clinicId: string) {
  return {
    id: true,
    clinicId: true,
    fullName: true,
    dateOfBirth: true,
    sex: true,
    phone: true,
    email: true,
    addressLine: true,
    clinicalNotes: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    ...patientWorkspaceSelect(clinicId),
  } satisfies Prisma.PatientSelect;
}

type PatientRecordRow = Prisma.PatientGetPayload<{
  select: ReturnType<typeof patientRecordSelect>;
}>;

type PatientListRow = Prisma.PatientGetPayload<{
  select: ReturnType<typeof patientListSelect>;
}>;

type PatientProfileRow = Prisma.PatientGetPayload<{
  select: ReturnType<typeof patientProfileSelect>;
}>;

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeConditionTags(tags: string[] | null | undefined): string[] {
  if (!tags) {
    return [];
  }

  return tags
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function parseDateOfBirth(value: string | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date of birth");
  }

  const [year, month, day] = value.split("-").map(Number);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Invalid date of birth");
  }

  return parsed;
}

function formatDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function formatDateTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

async function resolveNextAppointment(
  clinicId: string,
  patientId: string,
): Promise<string | null> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      clinicId,
      patientId,
      status: "upcoming",
      scheduledAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      scheduledAt: "asc",
    },
    select: {
      scheduledAt: true,
      durationMinutes: true,
    },
  });

  if (!appointment) {
    return null;
  }

  const date = appointment.scheduledAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${date} · ${appointment.durationMinutes} min`;
}

function toWorkspaceFields(
  row: Pick<PatientListRow, "conditionTags" | "sessions" | "_count">,
): {
  conditionTags: string[];
  lastVisitDate: string | null;
  unfinishedNoteCount: number;
  recentSessionStatus: RecentSessionStatus;
  nextAppointment: null;
} {
  const sessions = row.sessions ?? [];
  const recentSession = sessions[0];

  return {
    conditionTags: row.conditionTags ?? [],
    lastVisitDate: recentSession
      ? recentSession.startedAt.toISOString()
      : null,
    unfinishedNoteCount: row._count?.sessions ?? 0,
    recentSessionStatus: recentSession?.noteStatus ?? null,
    nextAppointment: null,
  };
}

function toPatientRecord(row: PatientRecordRow): PatientRecord {
  return {
    id: row.id,
    clinicId: row.clinicId,
    fullName: row.fullName,
    dateOfBirth: formatDateOnly(row.dateOfBirth),
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    addressLine: row.addressLine,
    clinicalNotes: row.clinicalNotes,
    ...toWorkspaceFields(row),
    archivedAt: formatDateTime(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function toPatientProfile(
  row: PatientProfileRow,
  clinicId: string,
): Promise<PatientProfileResponse> {
  const nextAppointment = await resolveNextAppointment(clinicId, row.id);

  return {
    id: row.id,
    fullName: row.fullName,
    dateOfBirth: formatDateOnly(row.dateOfBirth),
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    addressLine: row.addressLine,
    clinicalNotes: row.clinicalNotes,
    ...toWorkspaceFields(row),
    nextAppointment,
    archivedAt: formatDateTime(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPatientListItem(row: PatientListRow): PatientListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    dateOfBirth: formatDateOnly(row.dateOfBirth),
    sex: row.sex,
    phone: row.phone,
    email: row.email,
    addressLine: row.addressLine,
    ...toWorkspaceFields(row),
    archivedAt: formatDateTime(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildCreateData(
  clinicId: string,
  input: CreatePatientRequest,
): Prisma.PatientCreateInput {
  return {
    clinic: {
      connect: {
        id: clinicId,
      },
    },
    fullName: input.fullName.trim(),
    dateOfBirth: parseDateOfBirth(input.dateOfBirth),
    sex: input.sex ?? null,
    phone: normalizeText(input.phone),
    email: normalizeText(input.email),
    addressLine: normalizeText(input.addressLine),
    clinicalNotes: normalizeText(input.clinicalNotes),
    conditionTags: normalizeConditionTags(input.conditionTags),
  };
}

function buildUpdateData(input: UpdatePatientRequest): Prisma.PatientUpdateInput {
  const data: Prisma.PatientUpdateInput = {};

  if (input.fullName !== undefined) {
    data.fullName = input.fullName.trim();
  }

  if (input.dateOfBirth !== undefined) {
    data.dateOfBirth = parseDateOfBirth(input.dateOfBirth);
  }

  if (input.sex !== undefined) {
    data.sex = input.sex;
  }

  if (input.phone !== undefined) {
    data.phone = normalizeText(input.phone);
  }

  if (input.email !== undefined) {
    data.email = normalizeText(input.email);
  }

  if (input.addressLine !== undefined) {
    data.addressLine = normalizeText(input.addressLine);
  }

  if (input.clinicalNotes !== undefined) {
    data.clinicalNotes = normalizeText(input.clinicalNotes);
  }

  if (input.conditionTags !== undefined) {
    data.conditionTags = normalizeConditionTags(input.conditionTags);
  }

  return data;
}

function patientWhere(clinicId: string, patientId: string) {
  return {
    id_clinicId: {
      id: patientId,
      clinicId,
    },
  } as const;
}

export async function createPatient(input: {
  clinicId: string;
  input: CreatePatientRequest;
}): Promise<PatientRecord> {
  const patient = await prisma.patient.create({
    data: buildCreateData(input.clinicId, input.input),
    select: patientRecordSelect(input.clinicId),
  });

  return toPatientRecord(patient);
}

export async function updatePatient(input: {
  clinicId: string;
  patientId: string;
  input: UpdatePatientRequest;
}): Promise<PatientRecord> {
  const existing = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      clinicId: input.clinicId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw new PatientNotFoundError();
  }

  const patient = await prisma.patient.update({
    where: patientWhere(input.clinicId, input.patientId),
    data: buildUpdateData(input.input),
    select: patientRecordSelect(input.clinicId),
  });

  return toPatientRecord(patient);
}

export async function setPatientArchived(input: {
  clinicId: string;
  patientId: string;
  archived: boolean;
}): Promise<PatientRecord> {
  const existing = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      clinicId: input.clinicId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw new PatientNotFoundError();
  }

  const patient = await prisma.patient.update({
    where: patientWhere(input.clinicId, input.patientId),
    data: {
      archivedAt: input.archived ? new Date() : null,
    },
    select: patientRecordSelect(input.clinicId),
  });

  return toPatientRecord(patient);
}

export async function listPatients(input: {
  clinicId: string;
  query?: string;
  includeArchived?: boolean;
  limit?: number;
  cursor?: string | null;
}): Promise<ListPatientsResponse> {
  const query = input.query?.trim();
  const take = input.limit ?? 20;
  const where: Prisma.PatientWhereInput = {
    clinicId: input.clinicId,
    ...(input.includeArchived ? {} : { archivedAt: null }),
  };

  if (query) {
    where.OR = [
      { fullName: { contains: query, mode: "insensitive" } },
      { phone: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.patient.findMany({
    where,
    orderBy: [
      { fullName: "asc" },
      { id: "asc" },
    ],
    ...(input.cursor
      ? {
          cursor: { id: input.cursor },
          skip: 1,
        }
      : {}),
    take: take + 1,
    select: patientListSelect(input.clinicId),
  });

  const hasNextPage = rows.length > take;
  const items = rows.slice(0, take).map(toPatientListItem);

  return {
    items,
    nextCursor: hasNextPage ? items.at(-1)?.id ?? null : null,
  };
}

export async function getPatientProfile(input: {
  clinicId: string;
  patientId: string;
}): Promise<PatientProfileResponse> {
  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      clinicId: input.clinicId,
    },
    select: patientProfileSelect(input.clinicId),
  });

  if (!patient) {
    throw new PatientNotFoundError();
  }

  return toPatientProfile(patient, input.clinicId);
}

export const patientService = {
  createPatient,
  updatePatient,
  setPatientArchived,
  listPatients,
  getPatientProfile,
};
