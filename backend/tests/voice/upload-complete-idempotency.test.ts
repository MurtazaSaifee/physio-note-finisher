import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { registerVoiceRoutes } from "../../src/api/routes/voice.js";
import { registerVoiceJobRoutes } from "../../src/api/routes/voiceJobs.js";
import {
  createVoiceJobStore,
  enqueueTranscriptionJob,
  getVoiceJobStatus,
  markVoiceJobProcessing,
  markVoiceJobSucceeded,
  markVoiceJobFailed,
  resetVoiceJobStore,
} from "../../src/domain/voice/voiceJobService.js";
import {
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";
import { prisma } from "../../src/data/prismaClient.js";
import { putObject } from "../../src/infrastructure/s3/s3Client.js";
import type { StageQueue } from "../../src/workers/voiceWorker.js";

type StoredVoiceUpload = {
  clinicId: string;
  patientId: string;
  uploadId: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
  status: string;
  expiresAt: Date;
  completedAt: Date | null;
};

const prismaMocks = vi.hoisted(() => ({
  patientConsent: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  voiceUploads: new Map<string, StoredVoiceUpload>(),
}));

vi.mock("../../src/data/prismaClient.js", () => {
  return {
    prisma: {
      patientConsent: prismaMocks.patientConsent,
      voiceUpload: {
        create: vi.fn(async ({ data }) => {
          prismaMocks.voiceUploads.set(data.uploadId, { ...data, completedAt: null });
          return data;
        }),
        findFirst: vi.fn(async ({ where }) => {
          const row = prismaMocks.voiceUploads.get(where.uploadId);
          return row && row.clinicId === where.clinicId ? row : null;
        }),
        update: vi.fn(async ({ where, data }) => {
          const row = prismaMocks.voiceUploads.get(where.uploadId);
          if (!row) return null;
          const next = { ...row, ...data };
          prismaMocks.voiceUploads.set(where.uploadId, next);
          return next;
        }),
      },
    },
  };
});

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

async function buildApp(
  store?: ReturnType<typeof createVoiceJobStore>,
  queue?: StageQueue,
): Promise<FastifyInstance> {
  const app = Fastify();
  registerVoiceRoutes(app, queue, store);
  registerVoiceJobRoutes(app, queue, store);
  await app.ready();
  return app;
}

describe("upload complete idempotency", () => {
  beforeEach(() => {
    setAuthEnv();
    resetVoiceUploadStore();
    resetVoiceJobStore();
    prismaMocks.voiceUploads.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns stable response for duplicate completion without duplicate job", async () => {
    // Consent gate: mock active consent so upload creation succeeds
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue({
      id: "consent-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      type: "recording_ai_processing",
      status: "active",
      source: "clinician_confirmed_mobile",
      consentTextVersion: "v1.0",
      consentedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const store = createVoiceJobStore();
    const app = await buildApp(store);
    const accessToken = createAccessToken("clinic-1");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: validPayload(),
    });
    expect(created.statusCode).toBe(201);
    const { uploadId, storageKey } = created.json().data as {
      uploadId: string;
      storageKey: string;
    };

    // Simulate mobile uploading directly to storage via presigned URL
    const binaryPayload = Buffer.from("voice-complete-binary");
    await putObject(storageKey, binaryPayload);

    const first = await app.inject({
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
    expect(first.statusCode).toBe(200);
    const firstData = first.json().data as {
      uploadId: string;
      transcriptionJobId: string;
      status: string;
    };
    expect(firstData.transcriptionJobId).toBeDefined();
    await expect(store.findAll()).resolves.toHaveLength(1);
    await expect(
      getVoiceJobStatus(store, firstData.transcriptionJobId, "clinic-1"),
    ).resolves.toMatchObject({ storageKey });

    resetVoiceUploadStore();

    const second = await app.inject({
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
    expect(second.statusCode).toBe(200);
    const secondData = second.json().data as typeof firstData;

    // Stable response: same job ID, same status, same completedAt
    expect(secondData).toEqual(firstData);
    await expect(store.findAll()).resolves.toHaveLength(1);
  });

  it("marks the persisted transcription job failed when its initial queue enqueue rejects", async () => {
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue({
      id: "consent-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      type: "recording_ai_processing",
      status: "active",
      source: "clinician_confirmed_mobile",
      consentTextVersion: "v1.0",
      consentedAt: new Date(),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const rejectedQueue: StageQueue = {
      add: vi.fn().mockRejectedValue(new Error("queue unavailable")),
    };
    const store = createVoiceJobStore();
    const app = await buildApp(store, rejectedQueue);
    const accessToken = createAccessToken("clinic-1");

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: validPayload(),
    });
    const { uploadId, storageKey } = created.json().data as { uploadId: string; storageKey: string };
    await putObject(storageKey, Buffer.from("voice-complete-binary"));

    const complete = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${uploadId}/complete`,
      headers: { authorization: `Bearer ${accessToken}`, "x-clinic-id": "clinic-1" },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId,
        storageKey,
        durationSeconds: 75,
      },
    });

    expect(complete.statusCode).toBe(200);
    const jobId = complete.json().data.transcriptionJobId as string;
    await expect(getVoiceJobStatus(store, jobId, "clinic-1")).resolves.toMatchObject({
      status: "failed",
      stageState: "transcription_failed",
      errorMessage: "Voice queue unavailable. Please try again.",
    });
  });
});

describe("stage retry boundaries", () => {
  beforeEach(() => {
    setAuthEnv();
    resetVoiceUploadStore();
    resetVoiceJobStore();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects retry for succeeded jobs via route", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });
    await markVoiceJobProcessing(undefined, job.jobId, "clinic-1");
    await markVoiceJobSucceeded(undefined, job.jobId, "clinic-1");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/voice/jobs/${job.jobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/retry|succeeded/i);
  });

  it("enforces bounded retries for failed jobs", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const job = await enqueueTranscriptionJob(undefined, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
    });

    // Fail and retry up to the max of 3 attempts
    for (let i = 0; i < 3; i++) {
      await markVoiceJobProcessing(undefined, job.jobId, "clinic-1");
      await markVoiceJobFailed(undefined, job.jobId, "clinic-1", "provider timeout");

      const response = await app.inject({
        method: "POST",
        url: `/api/v1/voice/jobs/${job.jobId}/retry`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
        },
        payload: {},
      });

      if (i < 2) {
        expect(response.statusCode).toBe(200);
        expect(response.json().data.attempt).toBe(i + 2);
      } else {
        expect(response.statusCode).toBe(409);
        expect(response.json().error).toMatch(/limit|retry/i);
      }
    }
  });

  it("restores the failed stage when retry enqueue rejects", async () => {
    const rejectedQueue: StageQueue = {
      add: vi.fn().mockRejectedValue(new Error("queue unavailable")),
    };
    const store = createVoiceJobStore();
    const app = await buildApp(store, rejectedQueue);
    const accessToken = createAccessToken("clinic-1");
    const job = await enqueueTranscriptionJob(store, {
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
      stageState: "queued_transcription",
    });
    await markVoiceJobProcessing(store, job.jobId, "clinic-1");
    await markVoiceJobFailed(store, job.jobId, "clinic-1", "provider timeout");

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/voice/jobs/${job.jobId}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {},
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "voice_queue_unavailable",
      retryable: true,
      data: {
        jobId: job.jobId,
        status: "failed",
        stageState: "transcription_failed",
      },
    });
    await expect(getVoiceJobStatus(store, job.jobId, "clinic-1")).resolves.toMatchObject({
      status: "failed",
      stageState: "transcription_failed",
      stageRetries: { transcription: 1, soap: 0, summary: 0 },
    });
  });
});
