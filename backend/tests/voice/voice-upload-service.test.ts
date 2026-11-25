import { beforeEach, describe, expect, it, vi } from "vitest";

const { createPresignedUploadUrl, putObject } = vi.hoisted(() => ({
  createPresignedUploadUrl: vi.fn(async () => "https://example.com/upload"),
  putObject: vi.fn(),
}));

vi.mock("../../src/infrastructure/s3/s3Client.js", () => ({
  createPresignedUploadUrl,
  objectExists: vi.fn(),
  putObject,
}));

vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: {
    voiceUpload: {
      create: vi.fn(async ({ data }) => data),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  createVoiceUploadSession,
  receiveVoiceUploadBinary,
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";

describe("voice upload service", () => {
  beforeEach(() => {
    resetVoiceUploadStore();
    createPresignedUploadUrl.mockClear();
    putObject.mockReset();
  });

  it("signs the upload URL with the incoming audio mime type", async () => {
    const upload = await createVoiceUploadSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/m4a",
      fileName: "recap.m4a",
      fileSizeBytes: 4096,
      durationSeconds: 8,
    });

    expect(createPresignedUploadUrl).toHaveBeenCalledWith(
      upload.storageKey,
      "audio/m4a",
    );
  });

  it("redacts storage exception text while retaining the generic upload failure", async () => {
    const upload = await createVoiceUploadSession({
      clinicId: "clinic-1",
      patientId: "patient-1",
      mimeType: "audio/m4a",
      fileName: "recap.m4a",
      fileSizeBytes: 4096,
      durationSeconds: 8,
    });
    const rawStorageError =
      "storage rejected clinical detail: left knee pain; provider_token=sentinel-secret";
    putObject.mockRejectedValueOnce(new Error(rawStorageError));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const result = await receiveVoiceUploadBinary(
        "clinic-1",
        upload.uploadId,
        Buffer.from("audio"),
        5,
      );
      const serializedLogs = errorSpy.mock.calls
        .map((arguments_) => arguments_.map(String).join(" "))
        .join("\n");

      expect(result).toEqual({ success: false, error: "Failed to store upload" });
      expect(serializedLogs).toContain(
        '"errorCode":"voice_upload_storage_write_failed"',
      );
      expect(serializedLogs).toContain(
        '"errorClass":"VoiceUploadStorageFailure"',
      );
      expect(serializedLogs).not.toContain(rawStorageError);
      expect(serializedLogs).not.toContain("sentinel-secret");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
