import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { putObject, resetS3Client } from "../../src/infrastructure/s3/s3Client.js";
import { createInMemoryAuthRepository } from "../../src/api/routes/auth.js";
import { buildServer } from "../../src/server.js";
import type { StageQueue } from "../../src/workers/voiceWorker.js";
import type { VoiceProviders } from "../../src/domain/voice/providers/providerRegistry.js";

const voiceUploadRows = new Map<string, {
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
    patientConsent: {
      findFirst: vi.fn(async () => ({ id: "consent-1", status: "active" })),
    },
    voiceUpload: {
      create: vi.fn(async ({ data }) => {
        voiceUploadRows.set(data.uploadId, { ...data, completedAt: null });
        return data;
      }),
      findFirst: vi.fn(async ({ where }) => {
        const row = voiceUploadRows.get(where.uploadId);
        return row && row.clinicId === where.clinicId ? row : null;
      }),
      update: vi.fn(async ({ where, data }) => {
        const row = voiceUploadRows.get(where.uploadId);
        if (!row) return null;
        const next = { ...row, ...data };
        voiceUploadRows.set(where.uploadId, next);
        return next;
      }),
    },
  },
}));

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

async function buildAuthenticatedVoiceServer(options: {
  queue: StageQueue;
  voiceProviders?: VoiceProviders;
}) {
  const repository = createInMemoryAuthRepository();
  await repository.createUser({
    id: "user-1",
    clinicId: "clinic-1",
    email: "clinician@example.com",
    name: "Dr Physio",
    firstName: "Dr",
    lastName: "Physio",
    emailVerified: true,
    passwordHash: "unused",
    tokenVersion: 1,
  });

  return buildServer({ ...options, repository });
}

describe("buildServer voice upload queue wiring", () => {
  beforeEach(() => {
    setAuthEnv();
    resetS3Client();
    voiceUploadRows.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetS3Client();
    vi.clearAllMocks();
  });

  it("enqueues transcription on upload completion through buildServer", async () => {
    const add = vi.fn(async () => ({ id: "queued-job-1" }));
    const queue = { add } satisfies StageQueue;
    const app = await buildAuthenticatedVoiceServer({ queue });
    const accessToken = createAccessToken("clinic-1");
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "x-clinic-id": "clinic-1",
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers,
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        mimeType: "audio/m4a",
        fileName: "recap.m4a",
        fileSizeBytes: 4_000_000,
        durationSeconds: 75,
      },
    });

    expect(created.statusCode).toBe(201);
    const { uploadId, storageKey } = created.json().data as {
      uploadId: string;
      storageKey: string;
    };
    await putObject(storageKey, Buffer.from("audio"));

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${uploadId}/complete`,
      headers,
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId,
        storageKey,
        durationSeconds: 75,
      },
    });

    expect(completed.statusCode).toBe(200);
    expect(add).toHaveBeenCalledWith(
      "transcription",
      expect.objectContaining({ clinicId: "clinic-1", uploadId }),
      expect.objectContaining({ attempts: 3 }),
    );
    await app.close();
  });

  it("ignores provided Sarvam voice providers when running in local runtime", async () => {
    process.env.SARVAM_API_KEY = "dummy-sarvam-key";

    const queue = {
      add: vi.fn(async () => ({ id: "queued-job-1" })),
    } satisfies StageQueue;
    const app = await buildAuthenticatedVoiceServer({
      queue,
      voiceProviders: {
        sttProvider: {
          transcribe: vi.fn(async () => {
            throw new Error("Sarvam provider should not be used in local runtime");
          }),
        },
      },
    });

    const accessToken = createAccessToken("clinic-1");
    const headers = {
      authorization: `Bearer ${accessToken}`,
      "x-clinic-id": "clinic-1",
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers,
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        mimeType: "audio/m4a",
        fileName: "recap.m4a",
        fileSizeBytes: 4_000_000,
        durationSeconds: 75,
      },
    });

    expect(created.statusCode).toBe(201);
    const { uploadId, storageKey } = created.json().data as {
      uploadId: string;
      storageKey: string;
    };
    await putObject(storageKey, Buffer.from("audio"));

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${uploadId}/complete`,
      headers,
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
    await app.close();
  });
});
