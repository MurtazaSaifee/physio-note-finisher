import { prisma } from "../data/prismaClient.js";
import { putObject } from "../infrastructure/s3/s3Client.js";
import {
  EXPORT_QUEUE,
  requireQueueUrl,
  sendPointerMessage,
} from "../infrastructure/sqs/sqsQueues.js";
import { createLogger } from "../observability/logger.js";
import { generateSoapPdfExport } from "../domain/exports/pdfExportService.js";

const logger = createLogger({ component: "exportWorker" });

// ── Queue ────────────────────────────────────────────────────────────────────

export interface ExportJobData {
  exportId: string;
  clinicId?: string;
  sessionId?: string;
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

export function createSqsExportQueue(
  queueUrl = EXPORT_QUEUE,
) {
  return {
    async add(name: string, data: unknown, opts?: { jobId?: string }) {
      const targetQueueUrl = requireQueueUrl(queueUrl, "SQS_EXPORT_QUEUE_URL");
      const exportId =
        data &&
        typeof data === "object" &&
        "exportId" in data &&
        typeof data.exportId === "string"
          ? data.exportId
          : opts?.jobId?.replace(/-pdf$/, "");
      if (!exportId) {
        throw new Error("exportId is required for SQS export queue messages");
      }
      const result = await sendPointerMessage(targetQueueUrl, {
        jobType: name,
        jobId: exportId,
      });
      return { id: result.id ?? opts?.jobId ?? exportId };
    },
  };
}

export function createLocalExportQueue(): ExportQueue {
  return {
    async add(name: string, data: unknown, opts?: { jobId?: string }) {
      if (name !== "generate_pdf") {
        return { id: opts?.jobId };
      }

      await processExportJob(data as ExportJobData);

      const exportId =
        data &&
        typeof data === "object" &&
        "exportId" in data &&
        typeof data.exportId === "string"
          ? data.exportId
          : opts?.jobId?.replace(/-pdf$/, "");

      return { id: opts?.jobId ?? exportId };
    },
  };
}

// ── Job Processing ───────────────────────────────────────────────────────────

export async function processExportJob(data: ExportJobData): Promise<void> {
  const { exportId } = data;

  // 1. Fetch the export record
  const exportRecord = await prisma.exportRecord.findFirst({
    where: data.clinicId
      ? { id: exportId, clinicId: data.clinicId }
      : { id: exportId },
    select: {
      id: true,
      clinicId: true,
      sessionId: true,
      patientId: true,
      fileStatus: true,
      format: true,
    },
  });

  if (!exportRecord) {
    throw new Error(`Export record not found: ${exportId}`);
  }

  const clinicId = exportRecord.clinicId;
  const sessionId = data.sessionId ?? exportRecord.sessionId;

  // 2. Fetch session data
  const session = await prisma.session.findFirst({
    where: { id: sessionId, clinicId },
    select: {
      id: true,
      startedAt: true,
      visitType: true,
      noteStatus: true,
    },
  });

  if (!session) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  // 3. Fetch progress note (SOAP sections)
  const progressNote = await prisma.progressNote.findFirst({
    where: { sessionId, clinicId },
    select: {
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
    },
  });

  // 4. Fetch patient
  const patient = await prisma.patient.findFirst({
    where: { id: exportRecord.patientId, clinicId },
    select: { fullName: true },
  });

  // 5. Fetch clinic
  const clinic = await prisma.clinic.findFirst({
    where: { id: clinicId },
    select: { name: true },
  });

  // 6. Mark processing
  await prisma.exportRecord.update({
    where: { id: exportId },
    data: { fileStatus: "processing" },
  });

  // 7. Generate structured SOAP PDF
  const pdfBuffer = await generateSoapPdfExport({
    clinicName: clinic?.name ?? "Physio Clinic",
    patientName: patient?.fullName ?? "Unknown Patient",
    date: session.startedAt.toISOString().split("T")[0] ?? "",
    visitType: session.visitType,
    subjective: progressNote?.subjective ?? "",
    objective: progressNote?.objective ?? "",
    assessment: progressNote?.assessment ?? "",
    plan: progressNote?.plan ?? "",
  });

  // 8. Store PDF in S3/local storage
  const storageKey = `clinics/${clinicId}/exports/${sessionId}/${exportId}.pdf`;
  await putObject(storageKey, pdfBuffer, "application/pdf");

  // 9. Mark succeeded
  await prisma.exportRecord.update({
    where: { id: exportId },
    data: {
      fileStatus: "succeeded",
      fileStorageKey: storageKey,
      fileSizeBytes: pdfBuffer.length,
      fileError: null,
    },
  });

  logger.info("export.worker.job_succeeded", {
    exportId,
    clinicId,
    storageKey,
    sizeBytes: pdfBuffer.length,
  });
}
