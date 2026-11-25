import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { issueTokenPair } from "../../src/domain/auth/tokenService.js";
import {
  createVoiceJobStore,
  enqueueTranscriptionJob,
  resetVoiceJobStore,
  type VoiceJobStore,
} from "../../src/domain/voice/voiceJobService.js";
import {
  getExpiredAudioRecords,
  deleteAudioAndTranscript,
} from "../../src/domain/audio/retentionService.js";
import { registerRetentionWorker } from "../../src/workers/retentionWorker.js";
import { registerVoiceJobRoutes } from "../../src/api/routes/voiceJobs.js";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

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

async function buildApp(store: VoiceJobStore): Promise<FastifyInstance> {
  const app = Fastify();
  registerVoiceJobRoutes(app, undefined, store);
  await app.ready();
  return app;
}

describe("retention integration", () => {
  let store: VoiceJobStore;

  beforeEach(() => {
    setAuthEnv();
    resetVoiceJobStore();
    store = createVoiceJobStore();
  });

  describe("expired record detection and deletion", () => {
    it("finds voice jobs older than retention period", () => {
      const oldJob = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const job = store.jobs.get(oldJob.jobId)!;
      job.createdAt = daysAgo(8).toISOString();
      store.jobs.set(oldJob.jobId, job);

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "7d",
        batchSize: 100,
        store,
      });

      expect(expired.map((j) => j.jobId)).toContain(oldJob.jobId);
    });

    it("returns empty for forever retention", () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(365).toISOString();
      store.jobs.set(job.jobId, entry);

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "forever",
        batchSize: 100,
        store,
      });

      expect(expired).toHaveLength(0);
    });

    it("deletes audio and transcript from S3 and DB", async () => {
      const s3Delete = vi.fn().mockResolvedValue(undefined);
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.audioUrl = "https://s3.example.com/clinics/clinic-a/audio.m4a";
      store.jobs.set(job.jobId, entry);

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
        s3DeleteObject: s3Delete,
      });

      expect(result.success).toBe(true);
      expect(s3Delete).toHaveBeenCalledWith("https://s3.example.com/clinics/clinic-a/audio.m4a");
      expect(store.jobs.has(job.jobId)).toBe(true);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeDefined();
      expect(updated.audioUrl).toBeUndefined();
    });

    it("runs retention worker and processes expired batch", async () => {
      for (let i = 0; i < 3; i++) {
        const j = enqueueTranscriptionJob(store, {
          clinicId: "clinic-a",
          patientId: `patient-${i}`,
          uploadId: `upload-${i}`,
        });
        const entry = store.jobs.get(j.jobId)!;
        entry.createdAt = daysAgo(8).toISOString();
        store.jobs.set(j.jobId, entry);
      }

      const worker = registerRetentionWorker(store);
      const result = await worker.runRetentionJob({
        clinicId: "clinic-a",
        retentionPeriod: "7d",
      });

      expect(result.deletedCount).toBe(3);
      expect(result.clinicId).toBe("clinic-a");
    });

    it("skips forever retention clinics in worker", async () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(8).toISOString();
      store.jobs.set(job.jobId, entry);

      const worker = registerRetentionWorker(store);
      const result = await worker.runRetentionJob({
        clinicId: "clinic-a",
        retentionPeriod: "forever",
      });

      expect(result.deletedCount).toBe(0);
      expect(store.jobs.has(job.jobId)).toBe(true);
    });
  });

  describe("manual deletion endpoint", () => {
    it("removes S3 object and DB records via DELETE endpoint", async () => {
      const app = await buildApp(store);
      const accessToken = createAccessToken("clinic-a");

      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.storageKey = "clinics/clinic-a/voice-uploads/upload-1/audio.m4a";
      store.jobs.set(job.jobId, entry);

      // Override the default store used by voiceJobRoutes
      vi.spyOn(await import("../../src/domain/voice/voiceJobService.js"), "defaultStore", "get").mockReturnValue(store);

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/voice/jobs/${job.jobId}/recordings`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-a",
        },
      });

      expect(response.statusCode).toBe(204);
      expect(store.jobs.has(job.jobId)).toBe(true);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeDefined();
    });

    it("rejects deletion of job from different clinic", async () => {
      const app = await buildApp(store);
      const accessToken = createAccessToken("clinic-b");

      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/api/v1/voice/jobs/${job.jobId}/recordings`,
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-b",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("returns 404 for nonexistent job", async () => {
      const app = await buildApp(store);
      const accessToken = createAccessToken("clinic-a");

      const response = await app.inject({
        method: "DELETE",
        url: "/api/v1/voice/jobs/nonexistent-job/recordings",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-clinic-id": "clinic-a",
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
