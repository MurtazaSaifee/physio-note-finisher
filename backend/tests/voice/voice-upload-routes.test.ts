import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { registerVoiceRoutes } from "../../src/api/routes/voice.js";
import {
  InMemoryVoiceJobStore,
  type VoiceJobRecord,
} from "../../src/domain/voice/voiceJobService.js";
import { putObject } from "../../src/infrastructure/s3/s3Client.js";

// Mock prisma for consent gate — all existing upload route tests
// need an active consent record to pass the new consent guard.
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
    mimeType: "audio/m4a",
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

describe("voice upload routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects unauthenticated upload requests", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      payload: validPayload(),
    });

    expect(response.statusCode).toBe(401);
  });

  it("requires auth and clinic-scoped lookup for local playback fallback", async () => {
    const store = new InMemoryVoiceJobStore();
    const app = Fastify();
    registerVoiceRoutes(app, undefined, store);
    await app.ready();

    const storageKey = "clinics/clinic-1/voice-uploads/upload-1/audio.m4a";
    await putObject(storageKey, Buffer.from("voice-playback"));
    const job: VoiceJobRecord = {
      jobId: "job-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
      status: "queued",
      attempt: 1,
      maxAttempts: 3,
      errorMessage: null,
      transcript: null,
      storageKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.save(job);

    const unauthenticated = await app.inject({
      method: "GET",
      url: "/api/v1/voice/uploads/upload-1/binary",
    });
    expect(unauthenticated.statusCode).toBe(401);

    const wrongClinic = await app.inject({
      method: "GET",
      url: "/api/v1/voice/uploads/upload-1/binary",
      headers: {
        authorization: `Bearer ${createAccessToken("clinic-2")}`,
      },
    });
    expect(wrongClinic.statusCode).toBe(404);

    const allowed = await app.inject({
      method: "GET",
      url: "/api/v1/voice/uploads/upload-1/binary",
      headers: {
        authorization: `Bearer ${createAccessToken("clinic-1")}`,
      },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.body).toBe("voice-playback");
  });

  it("creates clinic-scoped upload sessions with valid metadata", async () => {
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
    expect(response.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: expect.any(String),
        uploadUrl: expect.stringContaining("/voice/uploads/"),
      }),
    });
  });

  it("rejects local binary upload attempts from another clinic", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");
    const otherClinicToken = createAccessToken("clinic-2");

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
    const createdPayload = created.json().data as { uploadId: string };

    const wrongClinic = await app.inject({
      method: "PUT",
      url: `/api/v1/voice/uploads/${createdPayload.uploadId}/binary`,
      headers: {
        authorization: `Bearer ${otherClinicToken}`,
        "x-clinic-id": "clinic-2",
        "content-type": "application/octet-stream",
        "content-length": "12",
      },
      payload: Buffer.from("voice-binary"),
    });

    expect(wrongClinic.statusCode).toBe(400);
    expect(wrongClinic.json()).toEqual({ error: "Upload session not found" });
  });

  it("rejects clinic mismatches and invalid payloads", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-2",
      },
      payload: {
        ...validPayload(),
        clinicId: "clinic-2",
      },
    });

    expect(forbidden.statusCode).toBe(403);

    const badPayload = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        ...validPayload(),
        durationSeconds: 4,
      },
    });

    expect(badPayload.statusCode).toBe(400);
  });

  it("completes only previously issued upload sessions", async () => {
    const app = await buildApp();
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
    const createdPayload = created.json().data as {
      uploadId: string;
      storageKey: string;
    };

    // Simulate mobile uploading directly to storage via presigned URL
    const binaryPayload = Buffer.from("voice-recap-binary");
    await putObject(createdPayload.storageKey, binaryPayload);

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${createdPayload.uploadId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: createdPayload.uploadId,
        storageKey: createdPayload.storageKey,
        durationSeconds: 75,
      },
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toEqual({
      success: true,
      data: expect.objectContaining({
        uploadId: createdPayload.uploadId,
        clinicId: "clinic-1",
        patientId: "patient-1",
        status: "uploaded",
        transcriptionJobId: expect.any(String),
      }),
    });
  });

  it("rejects forged or replayed completion payloads", async () => {
    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const forged = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads/upload-forged/complete",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: "upload-forged",
        storageKey: "clinics/clinic-1/patients/patient-1/voice/upload-forged/recap.m4a",
        durationSeconds: 75,
      },
    });
    expect(forged.statusCode).toBe(400);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: validPayload(),
    });
    const createdPayload = created.json().data as {
      uploadId: string;
      storageKey: string;
    };

    // Simulate mobile uploading directly to storage via presigned URL
    const binaryPayload = Buffer.from("voice-recap-binary");
    await putObject(createdPayload.storageKey, binaryPayload);

    const wrongStorageKey = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${createdPayload.uploadId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: createdPayload.uploadId,
        storageKey: `${createdPayload.storageKey}-tampered`,
        durationSeconds: 75,
      },
    });
    expect(wrongStorageKey.statusCode).toBe(400);

    const valid = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${createdPayload.uploadId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: createdPayload.uploadId,
        storageKey: createdPayload.storageKey,
        durationSeconds: 75,
      },
    });
    expect(valid.statusCode).toBe(200);

    const replayed = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${createdPayload.uploadId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: createdPayload.uploadId,
        storageKey: createdPayload.storageKey,
        durationSeconds: 75,
      },
    });
    // D-03: replayed completion returns stable prior response, not an error
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json().data).toEqual(valid.json().data);
  });
});
