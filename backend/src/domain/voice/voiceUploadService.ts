import { randomUUID } from "node:crypto";

import type {
  VoiceUploadCompleteRequest,
  VoiceUploadCompleteResponse,
  VoiceUploadRequest,
  VoiceUploadResponse,
} from "../../../../shared/contracts/voice.js";
import {
  enqueueTranscriptionJob,
  findVoiceJobByUploadId,
  markVoiceJobQueueFailed,
  type VoiceJobStore,
} from "./voiceJobService.js";
import type { StageQueue } from "../../workers/voiceWorker.js";
import {
  createPresignedUploadUrl,
  objectExists,
  putObject,
} from "../../infrastructure/storage/localStorageProvider.js";
import { createLogger } from "../../observability/logger.js";
import { prisma } from "../../data/prismaClient.js";

const logger = createLogger({ component: "voiceUploadService" });

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_IN_MEMORY_UPLOAD_SESSIONS = 1000;

type VoiceUploadSession = {
  clinicId: string;
  patientId: string;
  storageKey: string;
  fileSizeBytes: number;
  expiresAtMs: number;
  completedAtMs: number | null;
  fileReceived: boolean;
  completionResponse?: VoiceUploadCompleteResponse;
};

const uploadSessions = new Map<string, VoiceUploadSession>();

type VoiceUploadClient = {
  create(input: { data: {
    clinicId: string;
    patientId: string;
    uploadId: string;
    storageKey: string;
    mimeType: string;
    fileSizeBytes: number;
    status: "created" | "uploading" | "uploaded" | "completed" | "failed";
    expiresAt: Date;
  } }): Promise<unknown>;
  findFirst(input: {
    where: { uploadId: string; clinicId: string };
  }): Promise<{
    clinicId: string;
    patientId: string;
    storageKey: string;
    fileSizeBytes: number;
    expiresAt: Date;
    completedAt: Date | null;
  } | null>;
  update(input: {
    where: { uploadId: string };
    data: { status?: "uploaded"; completedAt?: Date };
  }): Promise<unknown>;
};

function voiceUploadClient(): VoiceUploadClient | undefined {
  return (prisma as unknown as { voiceUpload?: VoiceUploadClient }).voiceUpload;
}

export function resetVoiceUploadStore(): void {
  uploadSessions.clear();
}

function pruneUploadSessions(now = Date.now()): void {
  for (const [uploadId, session] of uploadSessions) {
    if (session.expiresAtMs <= now) {
      uploadSessions.delete(uploadId);
    }
  }

  while (uploadSessions.size >= MAX_IN_MEMORY_UPLOAD_SESSIONS) {
    const oldestUploadId = uploadSessions.keys().next().value;
    if (!oldestUploadId) {
      break;
    }
    uploadSessions.delete(oldestUploadId);
  }
}

function createStorageKey(
  clinicId: string,
  uploadId: string,
): string {
  // D-07: exact pattern — no patient names, only IDs
  return `clinics/${clinicId}/voice-uploads/${uploadId}/audio.m4a`;
}

export async function createVoiceUploadSession(
  input: VoiceUploadRequest,
): Promise<VoiceUploadResponse> {
  pruneUploadSessions();
  const uploadId = randomUUID();
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  const storageKey = createStorageKey(
    input.clinicId,
    uploadId,
  );

  const uploadUrl = await createPresignedUploadUrl(storageKey, input.mimeType);

  uploadSessions.set(uploadId, {
    clinicId: input.clinicId,
    patientId: input.patientId,
    storageKey,
    fileSizeBytes: input.fileSizeBytes,
    expiresAtMs,
    completedAtMs: null,
    fileReceived: false,
  });

  await voiceUploadClient()?.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      uploadId,
      storageKey,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      status: "created",
      expiresAt: new Date(expiresAtMs),
    },
  });

  return {
    uploadId,
    clinicId: input.clinicId,
    patientId: input.patientId,
    uploadUrl,
    storageKey,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export async function receiveVoiceUploadBinary(
  clinicId: string,
  uploadId: string,
  body: Buffer,
  contentLength: number | undefined,
): Promise<{ success: true } | { success: false; error: string }> {
  let session = uploadSessions.get(uploadId);
  if (session && session.clinicId !== clinicId) {
    return { success: false, error: "Upload session not found" };
  }
  if (!session) {
    const persisted = await voiceUploadClient()?.findFirst({
      where: { uploadId, clinicId },
    });
    if (!persisted) {
      return { success: false, error: "Upload session not found" };
    }
    session = {
      clinicId: persisted.clinicId,
      patientId: persisted.patientId,
      storageKey: persisted.storageKey,
      fileSizeBytes: persisted.fileSizeBytes,
      expiresAtMs: persisted.expiresAt.getTime(),
      completedAtMs: persisted.completedAt?.getTime() ?? null,
      fileReceived: false,
    };
  }
  if (session.expiresAtMs <= Date.now()) {
    uploadSessions.delete(uploadId);
    return { success: false, error: "Upload session expired" };
  }

  if (contentLength !== undefined && contentLength !== body.length) {
    logger.warn("voice.upload.content_length_mismatch", {
      uploadId,
      expected: contentLength,
      actual: body.length,
    });
    return { success: false, error: "Content-Length mismatch" };
  }

  try {
    await putObject(session.storageKey, body);
    session.fileReceived = true;
    uploadSessions.set(uploadId, session);
    logger.info("voice.upload.binary_received", { uploadId, size: body.length });
    return { success: true };
  } catch {
    logger.error("voice.upload.binary_write_failed", {
      uploadId,
      errorCode: "voice_upload_storage_write_failed",
      errorClass: "VoiceUploadStorageFailure",
    });
    return { success: false, error: "Failed to store upload" };
  }
}

export async function completeVoiceUploadSession(
  input: VoiceUploadCompleteRequest,
  queue?: StageQueue,
  store?: VoiceJobStore,
): Promise<VoiceUploadCompleteResponse | null> {
  const now = Date.now();
  let session = uploadSessions.get(input.uploadId);
  if (!session) {
    const persisted = await voiceUploadClient()?.findFirst({
      where: { uploadId: input.uploadId, clinicId: input.clinicId },
    });
    if (persisted) {
      session = {
        clinicId: persisted.clinicId,
        patientId: persisted.patientId,
        storageKey: persisted.storageKey,
        fileSizeBytes: persisted.fileSizeBytes,
        expiresAtMs: persisted.expiresAt.getTime(),
        completedAtMs: persisted.completedAt?.getTime() ?? null,
        fileReceived: false,
      };
    }
  }
  if (!session) {
    return null;
  }
  if (
    session.clinicId !== input.clinicId ||
    session.patientId !== input.patientId ||
    session.storageKey !== input.storageKey
  ) {
    return null;
  }
  if (session.expiresAtMs <= now) {
    return null;
  }

  // D-03: Idempotent completion — return stable prior response for replayed requests
  if (session.completedAtMs !== null) {
    if (session.completionResponse) {
      return session.completionResponse;
    }
    const existingJob = await findVoiceJobByUploadId(store, {
      clinicId: input.clinicId,
      uploadId: input.uploadId,
    });
    if (!existingJob) {
      return null;
    }
    return {
      uploadId: input.uploadId,
      clinicId: input.clinicId,
      patientId: input.patientId,
      status: "uploaded",
      completedAt: new Date(session.completedAtMs).toISOString(),
      transcriptionJobId: existingJob.jobId,
    };
  }

  // Verify the binary was actually received before completing
  if (!session.fileReceived) {
    // Double-check storage in case the in-memory flag was lost (e.g. process restart)
    const exists = await objectExists(session.storageKey);
    if (!exists) {
      logger.warn("voice.upload.complete_without_binary", { uploadId: input.uploadId });
      return null;
    }
    session.fileReceived = true;
  }

  session.completedAtMs = now;
  uploadSessions.set(input.uploadId, session);
  await voiceUploadClient()?.update({
    where: { uploadId: input.uploadId },
    data: { status: "uploaded", completedAt: new Date(now) },
  });

  const voiceJob = await enqueueTranscriptionJob(store, {
    clinicId: input.clinicId,
    patientId: input.patientId,
    uploadId: input.uploadId,
    storageKey: session.storageKey,
    durationSeconds: input.durationSeconds,
    stageState: "queued_transcription",
  });

  if (queue) {
    try {
      await queue.add(
        "transcription",
        {
          jobId: voiceJob.jobId,
          clinicId: input.clinicId,
          uploadId: input.uploadId,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          jobId: voiceJob.jobId,
        },
      );
    } catch {
      await markVoiceJobQueueFailed(store, voiceJob.jobId, input.clinicId);
      logger.error("voice.upload.transcription_enqueue_failed", {
        uploadId: input.uploadId,
        jobId: voiceJob.jobId,
      });
    }
  }

  const completedAt = new Date(now).toISOString();
  const response: VoiceUploadCompleteResponse = {
    uploadId: input.uploadId,
    clinicId: input.clinicId,
    patientId: input.patientId,
    status: "uploaded",
    completedAt,
    transcriptionJobId: voiceJob.jobId,
  };

  session.completionResponse = response;
  uploadSessions.set(input.uploadId, session);

  // CR-05: Clean up completed session from memory after 5 minutes
  setTimeout(() => uploadSessions.delete(input.uploadId), 5 * 60 * 1000);

  return response;
}
