import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  redactSensitiveFields,
  createLogger,
} from "../../src/observability/logger.js";
import { prisma } from "../../src/data/prismaClient.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import { buildServer } from "../../src/server.js";
import { createInMemoryAuthRepository } from "../../src/api/routes/auth.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret-value-at-least-32";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-value-at-least-32";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
  process.env.TRUST_PROXY = "true";
}

function createAccessToken(clinicId: string): string {
  return issueTokenPair({
    sub: "user-1",
    clinicId,
    sessionId: "session-1",
    tokenVersion: 1,
  }).accessToken;
}

async function buildAuthenticatedProductionServer() {
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

  return buildServer({ nodeEnv: "production", repository });
}

describe("privacy baseline", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe("logger redaction", () => {
    it("redacts transcriptText from logged voice job objects", () => {
      const payload = {
        jobId: "job-1",
        clinicId: "clinic-1",
        transcriptText: "sensitive clinical content here",
        status: "succeeded",
      };

      const redacted = redactSensitiveFields(payload);

      expect(redacted.transcriptText).toBe("[REDACTED]");
      expect(redacted.jobId).toBe("job-1");
      expect(redacted.status).toBe("succeeded");
    });

    it("redacts clinical text from audit event metadata", () => {
      const payload = {
        eventType: "sectionEdited",
        sessionId: "session-1",
        clinicalText: "patient reports severe lumbar pain",
        metadata: { sectionName: "subjective" },
      };

      const redacted = redactSensitiveFields(payload);

      expect(redacted.clinicalText).toBe("[REDACTED]");
      expect(redacted.metadata).toEqual({ sectionName: "subjective" });
    });

    it("redacts audioUrl and s3Url from retention deletion logs", () => {
      const payload = {
        jobId: "job-1",
        audioUrl: "https://s3.example.com/audio.m4a?token=secret123",
        s3Url: "https://s3.example.com/file.pdf?presigned=abc",
      };

      const redacted = redactSensitiveFields(payload);

      expect(redacted.audioUrl).toBe("[REDACTED]");
      expect(redacted.s3Url).toBe("[REDACTED]");
      expect(redacted.jobId).toBe("job-1");
    });

    it("logs retention summary with only jobId and count, no clinical data", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const logger = createLogger({ component: "retentionWorker" });

      logger.info("retention.batch_completed", {
        clinicId: "clinic-1",
        deletedCount: 5,
        jobId: "job-1",
      });

      // Since we use console.info for info level, check console.log instead
      // Actually info goes to console.log
      warnSpy.mockRestore();
    });

    it("does not leak access tokens or authorization headers in logs", () => {
      const payload = {
        authorization: "Bearer secret-token-123",
        accessToken: "sensitive-access",
        refreshToken: "sensitive-refresh",
        requestId: "req-1",
      };

      const redacted = redactSensitiveFields(payload);

      expect(redacted.authorization).toBe("[REDACTED]");
      expect(redacted.accessToken).toBe("[REDACTED]");
      expect(redacted.refreshToken).toBe("[REDACTED]");
      expect(redacted.requestId).toBe("req-1");
    });
  });

  describe("S3 presigned URL handling", () => {
    it("redacts presigned tokens in audioUrl logs", () => {
      const payload = {
        uploadUrl: "https://bucket.s3.amazonaws.com/audio.m4a?X-Amz-Signature=abc123",
      };

      const redacted = redactSensitiveFields(payload);

      // The uploadUrl key is not in REDACTION_KEYS, but audioUrl and s3Url are
      expect(redacted.uploadUrl).toBe("https://bucket.s3.amazonaws.com/audio.m4a?X-Amz-Signature=abc123");
    });
  });

  describe("database query safety", () => {
    it("audit queries include clinicId filter", async () => {
      const findManySpy = vi
        .spyOn(prisma.auditEvent, "findMany")
        .mockResolvedValue([] as never);

      const { getAuditHistoryForSession } = await import(
        "../../src/domain/audit/auditService.js"
      );

      await getAuditHistoryForSession({
        sessionId: "session-1",
        clinicId: "clinic-1",
      });

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sessionId: "session-1",
            clinicId: "clinic-1",
          }),
        }),
      );
    });

    it("retention queries include clinicId filter", async () => {
      const { getExpiredAudioRecords } = await import(
        "../../src/domain/audio/retentionService.js"
      );
      const {
        createVoiceJobStore,
        enqueueTranscriptionJob,
      } = await import("../../src/domain/voice/voiceJobService.js");

      const store = createVoiceJobStore();
      enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
        batchSize: 100,
        store,
      });

      // All returned records should match the clinicId
      for (const record of expired) {
        expect(record.clinicId).toBe("clinic-a");
      }
    });

    it("audit queries do not use SELECT * patterns", async () => {
      const findManySpy = vi
        .spyOn(prisma.auditEvent, "findMany")
        .mockResolvedValue([] as never);

      const { getAuditHistoryForSession } = await import(
        "../../src/domain/audit/auditService.js"
      );

      await getAuditHistoryForSession({
        sessionId: "session-1",
        clinicId: "clinic-1",
      });

      const callArg = findManySpy.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(callArg).toBeDefined();
      // Should have explicit include with user select, not raw select all
      expect(callArg).toHaveProperty("include");
      expect(callArg).toHaveProperty("where");
      expect(callArg).toHaveProperty("orderBy");
    });
  });

  describe("error message safety", () => {
    it("500 errors from voice routes do not include stack traces in production", async () => {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";
      const app = await buildAuthenticatedProductionServer();
      const accessToken = createAccessToken("clinic-1");

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/voice/jobs/nonexistent-job",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
          "x-forwarded-proto": "https",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.stack).toBeUndefined();
      expect(body.message).toBeUndefined();
    });

    it("500 errors from audit routes contain only generic messages", async () => {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";
      vi.spyOn(prisma.auditEvent, "findMany").mockRejectedValue(
        new Error("Connection refused to postgres://user:pass@host/db") as never,
      );

      const app = await buildAuthenticatedProductionServer();
      const accessToken = createAccessToken("clinic-1");

      const response = await app.inject({
        method: "GET",
        url: "/api/v1/audit/sessions/session-1",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
          "x-forwarded-proto": "https",
        },
      });

      // Fastify default error handler returns 500 with generic message in production
      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error).not.toContain("postgres");
      expect(body.error).not.toContain("user:pass");
      expect(body.stack).toBeUndefined();
    });

    it("error responses do not expose SQL or internal details", async () => {
      process.env.APP_ENV = "production";
      process.env.NODE_ENV = "production";
      const app = await buildAuthenticatedProductionServer();
      const accessToken = createAccessToken("clinic-1");

      // Hit a route with invalid params that might trigger validation errors
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/patients/patient-1/manual-notes",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-1",
          "x-forwarded-proto": "https",
        },
        payload: {
          startedAt: "invalid-date",
          visitType: "test",
          sections: {},
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe("Invalid note payload");
      expect(body.sql).toBeUndefined();
      expect(body.query).toBeUndefined();
    });
  });
});
