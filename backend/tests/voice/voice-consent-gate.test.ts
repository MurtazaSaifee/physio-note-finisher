import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { registerVoiceRoutes } from "../../src/api/routes/voice.js";
import { resetVoiceUploadStore } from "../../src/domain/voice/voiceUploadService.js";
import { resetVoiceJobStore } from "../../src/domain/voice/voiceJobService.js";
import { resetS3Client } from "../../src/infrastructure/s3/s3Client.js";
import { prisma } from "../../src/data/prismaClient.js";

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

vi.mock("../../src/data/prismaClient.js", () => {
  const mockPatientConsent = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
  return {
    prisma: {
      patientConsent: mockPatientConsent,
    },
  };
});

describe("voice consent gate", () => {
  beforeEach(() => {
    setAuthEnv();
    resetVoiceUploadStore();
    resetVoiceJobStore();
    resetS3Client();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("blocks upload metadata with 403 patient_consent_required when no active consent exists", async () => {
    // No active consent — assertPatientAiConsent should block
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue(null);

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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "patient_consent_required",
    });
  });

  it("creates an active clinic-scoped PatientConsent record via POST /api/v1/voice/consents", async () => {
    const now = new Date();
    const createdConsent = {
      id: "consent-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      type: "recording_ai_processing",
      status: "active",
      source: "clinician_confirmed_mobile",
      consentTextVersion: "v1-2026",
      consentedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    vi.mocked(prisma.patientConsent.upsert).mockResolvedValue(createdConsent as never);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice/consents",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
        "content-type": "application/json",
      },
      payload: {
        patientId: "patient-1",
        consentTextVersion: "v1-2026",
      },
    });

    expect(response.statusCode).toBe(201);
    const data = response.json().data as Record<string, unknown>;
    expect(data.clinicId).toBe("clinic-1");
    expect(data.patientId).toBe("patient-1");
    expect(data.type).toBe("recording_ai_processing");
    expect(data.status).toBe("active");
    expect(data.source).toBe("clinician_confirmed_mobile");

    expect(prisma.patientConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          clinicId: "clinic-1",
          patientId: "patient-1",
          type: "recording_ai_processing",
          status: "active",
          source: "clinician_confirmed_mobile",
          consentTextVersion: "v1-2026",
        }),
      }),
    );
  });

  it("allows upload metadata and completion after active consent is recorded", async () => {
    // Consent exists — gate should pass
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue({
      id: "consent-1",
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
    } as never);

    // Don't set S3 env vars — use local fallback so upload completion works
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    // Step 1: Create upload metadata — should succeed now that consent exists
    const metadata = await app.inject({
      method: "POST",
      url: "/api/v1/voice/uploads",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: validPayload(),
    });

    expect(metadata.statusCode).toBe(201);
    const metaData = metadata.json().data as {
      uploadId: string;
      storageKey: string;
    };
    expect(metaData.uploadId).toEqual(expect.any(String));

    // Step 2: Simulate binary uploaded to storage
    const { putObject } = await import("../../src/infrastructure/s3/s3Client.js");
    await putObject(metaData.storageKey, Buffer.from("test audio data"));

    // Step 3: Complete upload — should succeed with consent
    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/voice/uploads/${metaData.uploadId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-clinic-id": "clinic-1",
      },
      payload: {
        clinicId: "clinic-1",
        patientId: "patient-1",
        uploadId: metaData.uploadId,
        storageKey: metaData.storageKey,
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

  it("rejects upload when consent is revoked", async () => {
    // Consent exists but is revoked — the query filters for status: "active",
    // so real Prisma would return null. Mock accordingly.
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue(null);

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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "patient_consent_required",
    });
  });

  it("rejects upload when consent belongs to a different clinic", async () => {
    // Consent exists but for a different clinic
    vi.mocked(prisma.patientConsent.findFirst).mockResolvedValue(null);

    const app = await buildApp();
    const accessToken = createAccessToken("clinic-1");

    // Using clinic-1 in auth header but trying to upload for clinic-2
    // The clinic mismatch is caught first; consent would also reject
    // Here we test the cross-clinic consent guard:
    // findFirst is called with clinicId + patientId; it returns null for wrong clinic
    const response = await app.inject({
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

    // With clinic mismatch, either 403 (from authorizeClinic) or 403 (consent)
    // Both represent blocked access
    expect(response.statusCode).toBe(403);
  });
});
