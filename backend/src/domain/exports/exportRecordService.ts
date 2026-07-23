import { Prisma } from "@prisma/client";

import type {
  CreateExportRecordRequest,
  ExportRecordResponse,
  ListPatientExportRecordsResponse,
} from "../../../../shared/contracts/exports.js";
import { prisma } from "../../data/prismaClient.js";

export class InvalidExportRecordError extends Error {
  constructor() {
    super("Invalid export record");
    this.name = "InvalidExportRecordError";
  }
}

type ExportRecordRow = Prisma.ExportRecordGetPayload<{
  select: {
    id: true;
    sessionId: true;
    action: true;
	    type: true;
	    format: true;
	    exportedByUserId: true;
	    fileStatus: true;
	    fileError: true;
	    fileExpiresAt: true;
	    fileSizeBytes: true;
	    createdAt: true;
	  };
}>;

function toExportRecordResponse(record: ExportRecordRow): ExportRecordResponse {
  return {
    id: record.id,
    sessionId: record.sessionId,
    action: record.action,
    type: record.type,
	    format: record.format,
	    exportedByUserId: record.exportedByUserId,
	    fileStatus: record.fileStatus ?? null,
	    fileError: record.fileError ?? null,
	    fileExpiresAt: record.fileExpiresAt?.toISOString() ?? null,
	    fileSizeBytes: record.fileSizeBytes ?? null,
	    createdAt: record.createdAt.toISOString(),
	  };
}

async function ensureFinalizedSession(input: {
  clinicId: string;
  patientId: string;
  sessionId: string;
}): Promise<void> {
  const session = await prisma.session.findFirst({
    where: {
      clinicId: input.clinicId,
      id: input.sessionId,
    },
    select: {
      id: true,
      patientId: true,
      noteStatus: true,
    },
  });

  if (!session) {
    throw new InvalidExportRecordError();
  }

  if (session.patientId !== input.patientId || session.noteStatus !== "finalized") {
    throw new InvalidExportRecordError();
  }
}

export async function createExportRecord(input: {
  clinicId: string;
  userId: string;
  patientId: string;
  sessionId: string;
  input: CreateExportRecordRequest;
}): Promise<ExportRecordResponse> {
  await ensureFinalizedSession({
    clinicId: input.clinicId,
    patientId: input.patientId,
    sessionId: input.sessionId,
  });

  const record = await prisma.exportRecord.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId,
      exportedByUserId: input.userId,
      action: input.input.action,
      type: input.input.type,
      format: input.input.format,
    },
    select: {
      id: true,
      sessionId: true,
      action: true,
      type: true,
      format: true,
      exportedByUserId: true,
	      fileStatus: true,
	      fileError: true,
	      fileExpiresAt: true,
	      fileSizeBytes: true,
	      createdAt: true,
	    },
  });

  return toExportRecordResponse(record);
}

export interface ExportQueue {
  add(
    name: string,
    data: unknown,
    opts?: {
      attempts?: number;
      backoff?: { type: "exponential" | "fixed"; delay: number };
      jobId?: string;
    },
  ): Promise<unknown>;
}

/**
 * Enqueue an export generation job to the export-generation queue.
 * Uses deterministic job ID `${exportId}-pdf` for idempotency.
 */
export async function enqueueExportGeneration(
  queue: ExportQueue,
  exportId: string,
  clinicId: string,
  sessionId: string,
): Promise<{ jobId: string }> {
  const jobId = `${exportId}-pdf`;

  await queue.add(
    "generate_pdf",
    { exportId, clinicId, sessionId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      jobId,
    },
  );

  return { jobId };
}

/**
 * Fetch a single export record by ID and route scope.
 */
export async function getExportRecord(
  exportId: string,
  clinicId: string,
  patientId: string,
  sessionId: string,
): Promise<ExportRecordResponse | null> {
  const record = await prisma.exportRecord.findFirst({
    where: { id: exportId, clinicId, patientId, sessionId },
    select: {
      id: true,
      sessionId: true,
      action: true,
      type: true,
      format: true,
      exportedByUserId: true,
	      fileStatus: true,
	      fileError: true,
	      fileExpiresAt: true,
	      fileSizeBytes: true,
	      createdAt: true,
	    },
	  });

  return record ? toExportRecordResponse(record) : null;
}

export async function getExportRecordFile(input: {
  exportId: string;
  clinicId: string;
  patientId: string;
  sessionId: string;
}): Promise<{
  fileStatus: string | null;
  fileStorageKey: string | null;
} | null> {
  return prisma.exportRecord.findFirst({
    where: {
      id: input.exportId,
      clinicId: input.clinicId,
      patientId: input.patientId,
      sessionId: input.sessionId,
    },
    select: {
      fileStatus: true,
      fileStorageKey: true,
    },
  });
}

export async function listPatientExportRecords(input: {
  clinicId: string;
  patientId: string;
}): Promise<ListPatientExportRecordsResponse> {
  const records = await prisma.exportRecord.findMany({
    where: {
      clinicId: input.clinicId,
      patientId: input.patientId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      sessionId: true,
      action: true,
      type: true,
      format: true,
      exportedByUserId: true,
	      fileStatus: true,
	      fileError: true,
	      fileExpiresAt: true,
	      fileSizeBytes: true,
	      createdAt: true,
	    },
  });

  return {
    patientId: input.patientId,
    records: records.map(toExportRecordResponse),
  };
}
