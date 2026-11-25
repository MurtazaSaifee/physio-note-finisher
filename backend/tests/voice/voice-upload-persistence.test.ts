import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVoiceJobStore, getVoiceJobStatus } from "../../src/domain/voice/voiceJobService.js";
import {
  completeVoiceUploadSession,
  createVoiceUploadSession,
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";
import { putObject, resetS3Client } from "../../src/infrastructure/s3/s3Client.js";

const voiceUploads = new Map<string, {
  clinicId: string;
  patientId: string;
  uploadId: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  expiresAt: Date;
  completedAt: Date | null;
}>();

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: {
    voiceUpload: {
      create: vi.fn(async ({ data }) => {
        voiceUploads.set(data.uploadId, { ...data, completedAt: null });
        return data;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const row = voiceUploads.get(where.uploadId);
        return row && row.clinicId === where.clinicId ? row : null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = voiceUploads.get(where.uploadId);
        if (!row) return null;
        const next = { ...row, ...data };
        voiceUploads.set(where.uploadId, next);
        return next;
      }),
    },
  },
}));

describe("voice upload persistence", () => {
  beforeEach(() => {
    voiceUploads.clear();
    resetVoiceUploadStore();
    resetS3Client();
  });

  it("completes an upload from the durable VoiceUpload row when memory is empty", async () => {
    const upload = await createVoiceUploadSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/m4a",
      fileName: "recap.m4a",
      fileSizeBytes: 4_000_000,
      durationSeconds: 75,
    });
    await putObject(upload.storageKey, Buffer.from("audio"));
    resetVoiceUploadStore();

    const store = createVoiceJobStore();
    const completed = await completeVoiceUploadSession(
      {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        durationSeconds: 75,
      },
      undefined,
      store,
    );

    expect(completed?.transcriptionJobId).toEqual(expect.any(String));
    await expect(
      getVoiceJobStatus(store, completed!.transcriptionJobId, "clinic-1"),
    ).resolves.toMatchObject({ storageKey: upload.storageKey, durationSeconds: 75 });
    expect(voiceUploads.get(upload.uploadId)).toMatchObject({
      status: "uploaded",
      completedAt: expect.any(Date),
    });
  });
});
