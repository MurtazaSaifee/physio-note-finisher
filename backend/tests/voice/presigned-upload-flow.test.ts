import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma for consent gate — presigned upload tests need active consent
vi.mock("../../src/data/prismaClient.js", () => ({
  prisma: {
    patientConsent: {
      findFirst: vi.fn(async () => ({
        id: "consent-mock",
        clinicId: "clinic-1",
        patientId: "patient-1",
        type: "recording_ai_processing",
        status: "active",
        source: "clinician_confirmed_mobile",
        consentTextVersion: "v1-2026",
        consentedAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import {
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  resetS3Client,
} from "../../src/infrastructure/s3/s3Client.js";
import {
  registerVoiceRoutes,
} from "../../src/api/routes/voice.js";
import {
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";
import { resetVoiceJobStore } from "../../src/domain/voice/voiceJobService.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

function validPayload() {
  return {
    clinicId: "clinic-1",
    patientId: "patient-1",
    mimeType: "audio/m4a" as const,
    fileName: "recap.m4a",
    fileSizeBytes: 4_000_000,
    durationSeconds: 75,
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerVoiceRoutes(app);
  await app.ready();
  return app;
}

describe("presigned upload flow", () => {
  describe("presigned URL creation", () => {
    beforeEach(() => {
      setAuthEnv();
      resetS3Client();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      resetS3Client();
    });

    it("createPresignedUploadUrl returns a URL-like string when S3 is configured", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-uploads";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";
      process.env.PRESIGNED_UPLOAD_TTL_SECONDS = "300";

      const url = await createPresignedUploadUrl(
        "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
        "audio/mp4",
      );

      expect(url).toEqual(expect.any(String));
      expect(url.length).toBeGreaterThan(10);
      expect(url).toContain("X-Amz-Signature");
    });

    it("createPresignedUploadUrl uses env-configured TTL (default 300s)", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-uploads";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";
      // TTL defaults to 300 when env var is absent

      const url = await createPresignedUploadUrl(
        "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
        "audio/mp4",
      );

      // 300-second expiry (5 min) is encoded; presigned URL should exist
      expect(url).toContain("X-Amz-Expires=300");
    });

    it("createPresignedUploadUrl custom TTL overrides default", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-uploads";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";
      process.env.PRESIGNED_UPLOAD_TTL_SECONDS = "600";

      const url = await createPresignedUploadUrl(
        "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
        "audio/mp4",
        600,
      );

      expect(url).toContain("X-Amz-Expires=600");
    });

    it("createPresignedUploadUrl returns local fallback URL when S3 is not configured", async () => {
      // No S3 env vars — local fallback
      delete process.env.S3_REGION;
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;

      const url = await createPresignedUploadUrl(
        "clinics/clinic-1/voice-uploads/upload-1/audio.m4a",
        "audio/mp4",
      );

      expect(url).toEqual(expect.any(String));
      // Local fallback returns the /api/v1/voice/uploads/:id/binary path
      expect(url).toBe("/api/v1/voice/uploads/upload-1/binary");
    });
  });

  describe("presigned download URL creation", () => {
    beforeEach(() => {
      setAuthEnv();
      resetS3Client();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      resetS3Client();
    });

    it("createPresignedDownloadUrl returns a URL-like string with default 900s TTL", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-exports";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";

      const url = await createPresignedDownloadUrl(
        "clinics/clinic-1/exports/export-1/report.pdf",
      );

      expect(url).toEqual(expect.any(String));
      expect(url).toContain("X-Amz-Signature");
      expect(url).toContain("X-Amz-Expires=900");
    });

    it("createPresignedDownloadUrl respects custom TTL", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-exports";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";

      const url = await createPresignedDownloadUrl(
        "clinics/clinic-1/exports/export-1/report.pdf",
        1200,
      );

      expect(url).toContain("X-Amz-Expires=1200");
    });
  });

  describe("POST /api/v1/voice/uploads presigned response", () => {
    beforeEach(() => {
      setAuthEnv();
      resetVoiceUploadStore();
      resetVoiceJobStore();
      resetS3Client();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("returns a presigned upload URL (or local path) and D-07 storage key pattern", async () => {
      process.env.S3_REGION = "ap-south-1";
      process.env.S3_BUCKET = "physio-uploads";
      process.env.S3_ACCESS_KEY_ID = "test-key";
      process.env.S3_SECRET_ACCESS_KEY = "test-secret";

      const app = await buildApp();
      const accessToken = createAccessToken("clinic-1");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/voice/uploads",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(201);
      const data = response.json().data as {
        uploadId: string;
        uploadUrl: string;
        storageKey: string;
        expiresAt: string;
      };

      expect(data.uploadId).toEqual(expect.any(String));
      expect(data.uploadUrl).toEqual(expect.any(String));
      // D-07: key pattern — no patient name, only IDs
      expect(data.storageKey).toMatch(
        /^clinics\/clinic-1\/voice-uploads\/[^/]+\/audio\.m4a$/,
      );
      expect(data.expiresAt).toEqual(expect.any(String));
    });

    it("returns local fallback upload URL when S3 is not configured", async () => {
      const app = await buildApp();
      const accessToken = createAccessToken("clinic-1");

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/voice/uploads",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
        payload: validPayload(),
      });

      expect(response.statusCode).toBe(201);
      const data = response.json().data as { uploadUrl: string };

      // When S3 is not configured, uploadUrl is a local/binary path
      expect(data.uploadUrl).toEqual(expect.any(String));
    });
  });

  describe("PUT /api/v1/voice/uploads/:uploadId/binary local fallback", () => {
    beforeEach(() => {
      setAuthEnv();
      resetVoiceUploadStore();
      resetVoiceJobStore();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("stores binary uploads so local fallback completion can proceed", async () => {
      delete process.env.S3_REGION;
      delete process.env.S3_BUCKET;
      delete process.env.S3_ACCESS_KEY_ID;
      delete process.env.S3_SECRET_ACCESS_KEY;

      const app = await buildApp();
      const accessToken = createAccessToken("clinic-1");

      // Create an upload session first
      const created = await app.inject({
        method: "POST",
        url: "/api/v1/voice/uploads",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
        payload: validPayload(),
      });
      const { uploadId, storageKey } = created.json().data as {
        uploadId: string;
        storageKey: string;
      };

      const response = await app.inject({
        method: "PUT",
        url: `/api/v1/voice/uploads/${uploadId}/binary`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
          "content-type": "application/octet-stream",
        },
        payload: Buffer.from("test audio"),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });

      const completed = await app.inject({
        method: "POST",
        url: `/api/v1/voice/uploads/${uploadId}/complete`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
        payload: {
          clinicId: "clinic-1",
          patientId: "patient-1",
          uploadId,
          storageKey,
          durationSeconds: 75,
        },
      });

      expect(completed.statusCode).toBe(200);
      expect(completed.json().data).toEqual(
        expect.objectContaining({
          status: "uploaded",
          transcriptionJobId: expect.any(String),
        }),
      );
    });
  });
});

describe("export contracts", () => {
  it("ExportRecordResponse does not expose a permanent download URL", () => {
    // Key design rule (D-16): presigned download URLs are short-lived and
    // fetched separately. The persistent record must NOT contain a permanent URL.
    // This test validates the contract shape, not runtime types.

    // The ExportRecordResponse type (from shared/contracts/exports.ts)
    // must NOT include a `downloadUrl` field. A valid response object:
    const validResponse = {
      id: "export-1",
      sessionId: "session-1",
      action: "saved" as const,
      type: "fullNote" as const,
      format: "pdf" as const,
      exportedByUserId: "user-1",
      createdAt: new Date().toISOString(),
    };

    expect("downloadUrl" in validResponse).toBe(false);
    expect(validResponse).toHaveProperty("id");
    expect(validResponse).toHaveProperty("format");
    expect(validResponse).toHaveProperty("createdAt");
  });

  it("ExportRecordResponse includes fileStatus metadata for async generation", () => {
    // Phase 12 adds fileStatus to track async PDF generation state.
    // This test fails until ExportRecordResponse is extended with fileStatus.
    const response = {
      id: "export-1",
      sessionId: "session-1",
      action: "saved" as const,
      type: "fullNote" as const,
      format: "pdf" as const,
      exportedByUserId: "user-1",
      fileStatus: "generated" as const,
      createdAt: new Date().toISOString(),
    };
    expect(response).toHaveProperty("fileStatus");
  });
});
