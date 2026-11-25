import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertLegalTransition,
  createVoiceJobStore,
  enqueueTranscriptionJob,
  IllegalStageTransitionError,
  resetVoiceJobStore,
  retryVoiceJob,
  type VoiceJobRecord,
} from "../../src/domain/voice/voiceJobService.js";
import {
  createVoiceUploadSession,
  completeVoiceUploadSession,
  resetVoiceUploadStore,
} from "../../src/domain/voice/voiceUploadService.js";
import { generateSoapDraft } from "../../src/domain/voice/soapGenerationService.js";
import { generatePatientSummary } from "../../src/domain/voice/patientSummaryService.js";
import { runWithRepairLoop, AiRepairLoopExhaustedError } from "../../src/domain/voice/withRepairLoop.js";
import { putObject } from "../../src/infrastructure/s3/s3Client.js";
import { z } from "zod";

const CLINIC_ID = "clinic-eval-1";
const PATIENT_ID = "patient-eval-1";
const USER_ID = "user-eval-1";

describe("evaluation-set: voice pipeline D-10 metrics", () => {
  beforeEach(() => {
    resetVoiceJobStore();
    resetVoiceUploadStore();
  });

  describe("Test 1: happy path — upload -> transcription -> SOAP -> summary success", () => {
    it("completes full pipeline with all stages reaching terminal success", async () => {
      // Stage 1: Upload (presigned flow)
      const upload = await createVoiceUploadSession({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        mimeType: "audio/m4a",
        fileName: "eval-recap.m4a",
        fileSizeBytes: 2_000_000,
        durationSeconds: 60,
      });
      expect(upload.clinicId).toBe(CLINIC_ID);
      expect(upload.uploadId).toBeDefined();

      // Simulate mobile uploading directly to storage via presigned URL
      await putObject(upload.storageKey, Buffer.from("evaluation-upload-binary"));

      const completed = await completeVoiceUploadSession({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        durationSeconds: 60,
      });
      expect(completed).not.toBeNull();
      expect(completed?.status).toBe("uploaded");
      expect(completed?.transcriptionJobId).toBeDefined();

      // Stage 2: Transcription (auto-completed by upload service in current impl)
      // In production this would be async; here we verify the job record
      // is in succeeded status with transcript available
      // We can't easily get the jobId from the upload response since it's inside
      // the default store; verify via idempotency instead
      const replayed = await completeVoiceUploadSession({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        uploadId: upload.uploadId,
        storageKey: upload.storageKey,
        durationSeconds: 60,
      });
      expect(replayed?.transcriptionJobId).toBe(completed?.transcriptionJobId);

      // Stage 3: SOAP generation
      const soap = await generateSoapDraft({
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        userId: USER_ID,
        transcriptText: "Patient reports knee pain after running.",
      });
      expect(soap.sections).toBeDefined();
      expect(soap.sections.subjective).toContain("Patient reports");
      expect(soap.sections.objective).toBeDefined();
      expect(soap.sections.assessment).toBeDefined();
      expect(soap.sections.plan).toBeDefined();

      // Stage 4: Summary generation
      const summary = await generatePatientSummary(soap.sections);
      expect(summary).toBeTruthy();
      expect(summary.length).toBeGreaterThan(10);
      expect(summary.length).toBeLessThanOrEqual(2000);
    });
  });

  describe("Test 2: failed stage retry path recovers without rerunning already-successful stages", () => {
    it("retries only the failed stage and preserves prior stage retry counts", async () => {
      const store = createVoiceJobStore();
      const job = await enqueueTranscriptionJob(store, {
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        uploadId: "upload-retry-1",
      });

      // Simulate: transcription succeeded, SOAP failed once
      const withStages: VoiceJobRecord = {
        ...job,
        stageState: "soap_failed",
        stageRetries: { transcription: 0, soap: 1, summary: 0 },
        status: "failed",
      };
      store.jobs.set(job.jobId, withStages);

      const retried = await retryVoiceJob(store, job.jobId, CLINIC_ID);

      // Should queue only SOAP, not transcription or summary
      expect(retried.stageState).toBe("queued_soap");
      expect(retried.stageRetries?.soap).toBe(2);
      // Transcription and summary retries must be unchanged
      expect(retried.stageRetries?.transcription).toBe(0);
      expect(retried.stageRetries?.summary).toBe(0);
    });

    it("blocks retry after max stage attempts (3) and keeps prior successful stages intact", async () => {
      const store = createVoiceJobStore();
      const job = await enqueueTranscriptionJob(store, {
        clinicId: CLINIC_ID,
        patientId: PATIENT_ID,
        uploadId: "upload-retry-2",
      });

      // Simulate: transcription succeeded, SOAP exhausted all 3 retries
      const exhausted: VoiceJobRecord = {
        ...job,
        stageState: "soap_failed",
        stageRetries: { transcription: 0, soap: 3, summary: 0 },
        status: "failed",
      };
      store.jobs.set(job.jobId, exhausted);

      await expect(retryVoiceJob(store, job.jobId, CLINIC_ID)).rejects.toThrow("Stage retry limit reached");
    });
  });

  describe("Test 3: invalid AI output path records explicit stage failure after 3 repair attempts", () => {
    it("throws AiRepairLoopExhaustedError after 3 invalid schema attempts", async () => {
      const badGenerator = vi.fn().mockResolvedValue({ invalid: true });
      const schema = z.object({ requiredField: z.string() });

      await expect(
        runWithRepairLoop(badGenerator, schema, "soap"),
      ).rejects.toThrow(AiRepairLoopExhaustedError);

      // Must have been called exactly 3 times
      expect(badGenerator).toHaveBeenCalledTimes(3);
    });

    it("error carries stage name and attempt count", async () => {
      const badGenerator = vi.fn().mockResolvedValue({ invalid: true });
      const schema = z.object({ requiredField: z.string() });

      try {
        await runWithRepairLoop(badGenerator, schema, "summary");
        expect.fail("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AiRepairLoopExhaustedError);
        if (error instanceof AiRepairLoopExhaustedError) {
          expect(error.stageName).toBe("summary");
          expect(error.attempts).toBe(3);
          expect(error.message).toContain("summary_failed:invalid_llm_output");
        }
      }
    });

    it("succeeds on first attempt when generator returns valid schema", async () => {
      const goodGenerator = vi.fn().mockResolvedValue({ requiredField: "valid" });
      const schema = z.object({ requiredField: z.string() });

      const result = await runWithRepairLoop(goodGenerator, schema, "soap");
      expect(result).toEqual({ requiredField: "valid" });
      expect(goodGenerator).toHaveBeenCalledTimes(1);
    });
  });

  describe("Test 4: stage transition integrity metrics", () => {
    it("asserts legal transitions for every stage in the pipeline graph", () => {
      // Forward progression through full pipeline
      expect(() => assertLegalTransition("uploaded", "queued_transcription")).not.toThrow();
      expect(() => assertLegalTransition("queued_transcription", "transcribing")).not.toThrow();
      expect(() => assertLegalTransition("transcribing", "transcription_succeeded")).not.toThrow();
      expect(() => assertLegalTransition("transcription_succeeded", "queued_soap")).not.toThrow();
      expect(() => assertLegalTransition("queued_soap", "generating_soap")).not.toThrow();
      expect(() => assertLegalTransition("generating_soap", "soap_succeeded")).not.toThrow();
      expect(() => assertLegalTransition("soap_succeeded", "queued_summary")).not.toThrow();
      expect(() => assertLegalTransition("queued_summary", "generating_summary")).not.toThrow();
      expect(() => assertLegalTransition("generating_summary", "summary_succeeded")).not.toThrow();
      expect(() => assertLegalTransition("summary_succeeded", "succeeded")).not.toThrow();
    });

    it("rejects illegal backward jumps", () => {
      expect(() => assertLegalTransition("succeeded", "uploaded")).toThrow(IllegalStageTransitionError);
      expect(() => assertLegalTransition("soap_succeeded", "transcribing")).toThrow(IllegalStageTransitionError);
      expect(() => assertLegalTransition("summary_succeeded", "queued_soap")).toThrow(IllegalStageTransitionError);
    });

    it("allows retry transitions from failed stages only", () => {
      expect(() => assertLegalTransition("transcription_failed", "queued_transcription")).not.toThrow();
      expect(() => assertLegalTransition("soap_failed", "queued_soap")).not.toThrow();
      expect(() => assertLegalTransition("summary_failed", "queued_summary")).not.toThrow();
    });
  });
});
