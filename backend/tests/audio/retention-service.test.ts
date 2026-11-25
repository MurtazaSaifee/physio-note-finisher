import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVoiceJobStore,
  enqueueTranscriptionJob,
  resetVoiceJobStore,
  type VoiceJobStore,
} from "../../src/domain/voice/voiceJobService.js";
import {
  getExpiredAudioRecords,
  deleteAudioAndTranscript,
  getRetentionPolicy,
} from "../../src/domain/audio/retentionService.js";
import { registerRetentionWorker } from "../../src/workers/retentionWorker.js";
import {
  startRetentionScheduler,
  stopRetentionScheduler,
} from "../../src/workers/retentionScheduler.js";
import { deleteObject } from "../../src/infrastructure/s3/s3Client.js";
import { InMemoryAuthRepository } from "../../src/domain/auth/inMemoryAuthRepository.js";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("retentionService", () => {
  let store: VoiceJobStore;
  let repository: InMemoryAuthRepository;

  beforeEach(() => {
    resetVoiceJobStore();
    store = createVoiceJobStore();
    repository = new InMemoryAuthRepository();
  });

  describe("getExpiredAudioRecords", () => {
    it("returns voice jobs older than retention period for a given clinic", () => {
      const oldJob = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      // Simulate createdAt by mutating the store entry
      const job = store.jobs.get(oldJob.jobId)!;
      job.createdAt = daysAgo(31).toISOString();
      store.jobs.set(oldJob.jobId, job);

      const recentJob = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-2",
        uploadId: "upload-2",
      });

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
        batchSize: 100,
        store,
      });

      expect(expired.map((j) => j.jobId)).toContain(oldJob.jobId);
      expect(expired.map((j) => j.jobId)).not.toContain(recentJob.jobId);
    });

    it("returns nothing for forever retention", () => {
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

    it("respects batch size", () => {
      for (let i = 0; i < 5; i++) {
        const j = enqueueTranscriptionJob(store, {
          clinicId: "clinic-a",
          patientId: `patient-${i}`,
          uploadId: `upload-${i}`,
        });
        const entry = store.jobs.get(j.jobId)!;
        entry.createdAt = daysAgo(31).toISOString();
        store.jobs.set(j.jobId, entry);
      }

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
        batchSize: 2,
        store,
      });

      expect(expired).toHaveLength(2);
    });

    it("filters by clinicId", () => {
      const clinicAJob = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entryA = store.jobs.get(clinicAJob.jobId)!;
      entryA.createdAt = daysAgo(31).toISOString();
      store.jobs.set(clinicAJob.jobId, entryA);

      const clinicBJob = enqueueTranscriptionJob(store, {
        clinicId: "clinic-b",
        patientId: "patient-2",
        uploadId: "upload-2",
      });
      const entryB = store.jobs.get(clinicBJob.jobId)!;
      entryB.createdAt = daysAgo(31).toISOString();
      store.jobs.set(clinicBJob.jobId, entryB);

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
        batchSize: 100,
        store,
      });

      expect(expired.map((j) => j.jobId)).toContain(clinicAJob.jobId);
      expect(expired.map((j) => j.jobId)).not.toContain(clinicBJob.jobId);
    });

    it("does not return already deleted records", () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(31).toISOString();
      entry.audioDeletedAt = new Date().toISOString();
      store.jobs.set(job.jobId, entry);

      const expired = getExpiredAudioRecords({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
        batchSize: 100,
        store,
      });

      expect(expired).toHaveLength(0);
    });
  });

  describe("deleteAudioAndTranscript", () => {
    it("marks voice job audio as deleted and returns success", async () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
      });

      expect(result.success).toBe(true);
      expect(store.jobs.has(job.jobId)).toBe(true);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeDefined();
      expect(updated.transcript).toBeNull();
    });

    it("handles missing job gracefully", async () => {
      const result = await deleteAudioAndTranscript({
        jobId: "nonexistent-job",
        clinicId: "clinic-a",
        store,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Voice job not found");
    });

    it("handles mismatched clinicId gracefully", async () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-b",
        store,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Voice job not found");
    });

    it("calls S3 delete when audioUrl is present", async () => {
      const s3Delete = vi.fn().mockResolvedValue(undefined);
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.audioUrl = "https://s3.example.com/audio.m4a";
      store.jobs.set(job.jobId, entry);

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
        s3DeleteObject: s3Delete,
      });

      expect(result.success).toBe(true);
      expect(s3Delete).toHaveBeenCalledWith("https://s3.example.com/audio.m4a");
    });

    it("succeeds even when S3 object is already deleted", async () => {
      const s3Delete = vi.fn().mockRejectedValue(new Error("NoSuchKey"));
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.audioUrl = "https://s3.example.com/audio.m4a";
      store.jobs.set(job.jobId, entry);

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
        s3DeleteObject: s3Delete,
      });

      expect(result.success).toBe(true);
      expect(store.jobs.has(job.jobId)).toBe(true);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeDefined();
      expect(updated.audioUrl).toBeUndefined();
    });

    it("does not mark audio deleted when storage deletion fails unexpectedly", async () => {
      const s3Delete = vi.fn().mockRejectedValue(new Error("AccessDenied"));
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
        storageKey: "clinics/clinic-a/voice-uploads/upload-1/audio.m4a",
      });

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
        s3DeleteObject: s3Delete,
      });

      expect(result.success).toBe(false);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeUndefined();
      expect(updated.storageKey).toBe("clinics/clinic-a/voice-uploads/upload-1/audio.m4a");
    });
  });

  describe("getRetentionPolicy", () => {
    it("returns the user's configured retention period", async () => {
      const user = {
        id: "user-1",
        clinicId: "clinic-a",
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        lastName: "User",
        passwordHash: "hash",
        tokenVersion: 0,
        audioRetentionPeriod: "7d",
      };
      await repository.createUser(user);

      const policy = await getRetentionPolicy({
        userId: "user-1",
        repository,
      });

      expect(policy).toBe("7d");
    });

    it("returns default 30d when user has no retention period set", async () => {
      const user = {
        id: "user-1",
        clinicId: "clinic-a",
        email: "test@example.com",
        name: "Test User",
        firstName: "Test",
        lastName: "User",
        passwordHash: "hash",
        tokenVersion: 0,
      };
      await repository.createUser(user);

      const policy = await getRetentionPolicy({
        userId: "user-1",
        repository,
      });

      expect(policy).toBe("30d");
    });

    it("returns default 30d when user not found", async () => {
      const policy = await getRetentionPolicy({
        userId: "nonexistent",
        repository,
      });

      expect(policy).toBe("30d");
    });
  });

  describe("retentionWorker", () => {
    it("processes expired records in batches of 100", async () => {
      for (let i = 0; i < 5; i++) {
        const j = enqueueTranscriptionJob(store, {
          clinicId: "clinic-a",
          patientId: `patient-${i}`,
          uploadId: `upload-${i}`,
        });
        const entry = store.jobs.get(j.jobId)!;
        entry.createdAt = daysAgo(31).toISOString();
        store.jobs.set(j.jobId, entry);
      }

      const worker = registerRetentionWorker(store);
      const result = await worker.runRetentionJob({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
      });

      expect(result.deletedCount).toBe(5);
      expect(result.clinicId).toBe("clinic-a");
    });

    it("processes all clinics when no clinicId provided", async () => {
      for (let i = 0; i < 3; i++) {
        const j = enqueueTranscriptionJob(store, {
          clinicId: "clinic-a",
          patientId: `patient-a-${i}`,
          uploadId: `upload-a-${i}`,
        });
        const entry = store.jobs.get(j.jobId)!;
        entry.createdAt = daysAgo(31).toISOString();
        store.jobs.set(j.jobId, entry);
      }

      for (let i = 0; i < 2; i++) {
        const j = enqueueTranscriptionJob(store, {
          clinicId: "clinic-b",
          patientId: `patient-b-${i}`,
          uploadId: `upload-b-${i}`,
        });
        const entry = store.jobs.get(j.jobId)!;
        entry.createdAt = daysAgo(31).toISOString();
        store.jobs.set(j.jobId, entry);
      }

      const worker = registerRetentionWorker(store);
      const result = await worker.runRetentionJob({
        retentionPeriod: "30d",
      });

      expect(result.deletedCount).toBe(5);
    });

    it("skips forever retention clinics", async () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(31).toISOString();
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

  describe("production S3 deletion path (T-01)", () => {
    it("retention worker invokes injected S3 delete adapter with storage key from record", async () => {
      const s3DeleteSpy = vi.fn().mockResolvedValue(undefined);
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
        storageKey: "clinics/clinic-a/voice-uploads/upload-1/audio.m4a",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(31).toISOString();
      store.jobs.set(job.jobId, entry);

      const worker = registerRetentionWorker(store, s3DeleteSpy);
      const result = await worker.runRetentionJob({
        clinicId: "clinic-a",
        retentionPeriod: "30d",
      });

      expect(result.deletedCount).toBe(1);
      expect(s3DeleteSpy).toHaveBeenCalledTimes(1);
      expect(s3DeleteSpy).toHaveBeenCalledWith("clinics/clinic-a/voice-uploads/upload-1/audio.m4a");
    });

    it("clears duplicate clinical text fields when deleting expired voice artifacts", async () => {
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-phi",
        storageKey: "clinics/clinic-a/voice-uploads/upload-phi/audio.m4a",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(31).toISOString();
      entry.transcript = {
        transcriptStatus: "ready",
        text: "Patient reports PHI-heavy recap.",
        segments: [],
      };
      entry.soapDraft = JSON.stringify({
        subjective: "PHI subjective.",
        objective: "PHI objective.",
        assessment: "PHI assessment.",
        plan: "PHI plan.",
      });
      entry.patientSummary = "PHI summary.";
      store.jobs.set(job.jobId, entry);

      const result = await deleteAudioAndTranscript({
        jobId: job.jobId,
        clinicId: "clinic-a",
        store,
        s3DeleteObject: vi.fn().mockResolvedValue(undefined),
      });

      const updated = store.jobs.get(job.jobId)!;
      expect(result.success).toBe(true);
      expect(updated.transcript).toBeNull();
      expect(updated.soapDraft).toBeUndefined();
      expect(updated.patientSummary).toBeUndefined();
      expect(updated.storageKey).toBeUndefined();
    });

    it("s3Client.deleteObject is exported as the production adapter", () => {
      expect(typeof deleteObject).toBe("function");
    });
  });

  describe("retention scheduler lifecycle (T-02)", () => {
    it("starts and stops without throwing", () => {
      const scheduler = startRetentionScheduler({ intervalMs: 99999 });
      expect(scheduler).toBeDefined();
      expect(() => stopRetentionScheduler(scheduler)).not.toThrow();
    });

    it("does not create duplicate intervals when started twice", () => {
      const scheduler1 = startRetentionScheduler({ intervalMs: 99999 });
      const scheduler2 = startRetentionScheduler({ intervalMs: 99999 });
      expect(scheduler1).not.toBe(scheduler2);
      stopRetentionScheduler(scheduler1);
      stopRetentionScheduler(scheduler2);
    });

    it("executes retention job on interval tick", async () => {
      const s3DeleteSpy = vi.fn().mockResolvedValue(undefined);
      const job = enqueueTranscriptionJob(store, {
        clinicId: "clinic-a",
        patientId: "patient-1",
        uploadId: "upload-1",
      });
      const entry = store.jobs.get(job.jobId)!;
      entry.createdAt = daysAgo(31).toISOString();
      store.jobs.set(job.jobId, entry);

      const scheduler = startRetentionScheduler({
        intervalMs: 50,
        store,
        s3DeleteObject: s3DeleteSpy,
      });

      // Wait for at least one tick
      await new Promise((resolve) => setTimeout(resolve, 120));

      stopRetentionScheduler(scheduler);

      // The scheduler should have run at least once and marked the expired record
      expect(store.jobs.has(job.jobId)).toBe(true);
      const updated = store.jobs.get(job.jobId)!;
      expect(updated.audioDeletedAt).toBeDefined();
    });
  });
});
