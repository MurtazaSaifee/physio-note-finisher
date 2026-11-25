import { describe, expect, it } from "vitest";
import {
  type VoicePipelineStageState,
  type VoicePipelineJob,
  type StageRetries,
  assertLegalTransition,
  IllegalStageTransitionError,
  canRetryStage,
  incrementStageRetry,
} from "../../src/domain/voice/voiceJobService.js";

describe("voice stage state machine", () => {
  describe("legal transitions", () => {
    // Phase 12 (D-09): upload lifecycle now starts at `created`
    it("allows created -> uploading -> uploaded", () => {
      expect(() =>
        assertLegalTransition("created", "uploading"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("uploading", "uploaded"),
      ).not.toThrow();
    });

    it("allows uploaded -> queued_transcription", () => {
      expect(() =>
        assertLegalTransition("uploaded", "queued_transcription"),
      ).not.toThrow();
    });

    it("allows queued_transcription -> transcribing -> transcription_succeeded -> queued_soap", () => {
      expect(() =>
        assertLegalTransition("queued_transcription", "transcribing"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("transcribing", "transcription_succeeded"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("transcription_succeeded", "queued_soap"),
      ).not.toThrow();
    });

    it("allows transcription failure and retry path", () => {
      expect(() =>
        assertLegalTransition("transcribing", "transcription_failed"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("transcription_failed", "queued_transcription"),
      ).not.toThrow();
    });

    it("allows full success path through all stages to succeeded", () => {
      expect(() =>
        assertLegalTransition("queued_soap", "generating_soap"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("generating_soap", "soap_succeeded"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("soap_succeeded", "queued_summary"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("queued_summary", "generating_summary"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("generating_summary", "summary_succeeded"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("summary_succeeded", "succeeded"),
      ).not.toThrow();
    });

    it("allows soap failure and retry path", () => {
      expect(() =>
        assertLegalTransition("generating_soap", "soap_failed"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("soap_failed", "queued_soap"),
      ).not.toThrow();
    });

    it("allows summary failure and retry path", () => {
      expect(() =>
        assertLegalTransition("generating_summary", "summary_failed"),
      ).not.toThrow();
      expect(() =>
        assertLegalTransition("summary_failed", "queued_summary"),
      ).not.toThrow();
    });
  });

  describe("illegal transitions", () => {
    it("throws IllegalStageTransitionError for skipped stages", () => {
      expect(() =>
        assertLegalTransition("uploaded", "transcribing"),
      ).toThrow(IllegalStageTransitionError);
      expect(() =>
        assertLegalTransition("uploaded", "succeeded"),
      ).toThrow(IllegalStageTransitionError);
    });

    it("throws IllegalStageTransitionError for backward jumps outside retry paths", () => {
      expect(() =>
        assertLegalTransition("transcription_succeeded", "transcribing"),
      ).toThrow(IllegalStageTransitionError);
      expect(() =>
        assertLegalTransition("soap_succeeded", "queued_transcription"),
      ).toThrow(IllegalStageTransitionError);
      expect(() =>
        assertLegalTransition("succeeded", "generating_summary"),
      ).toThrow(IllegalStageTransitionError);
    });

    it("throws IllegalStageTransitionError for invalid cross-stage jumps", () => {
      expect(() =>
        assertLegalTransition("transcribing", "generating_soap"),
      ).toThrow(IllegalStageTransitionError);
      expect(() =>
        assertLegalTransition("queued_soap", "generating_summary"),
      ).toThrow(IllegalStageTransitionError);
    });
  });

  describe("stage-local retries", () => {
    const baseJob = (): VoicePipelineJob => ({
      id: "job-1",
      clinicId: "clinic-1",
      patientId: "patient-1",
      uploadId: "upload-1",
      currentState: "transcription_failed" as VoicePipelineStageState,
      stageRetries: { transcription: 0, soap: 0, summary: 0 } as StageRetries,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it("allows retry up to max attempts per stage", () => {
      const job = baseJob();

      expect(canRetryStage(job, "transcription")).toBe(true);

      const afterRetry1 = incrementStageRetry(job, "transcription");
      expect(afterRetry1.stageRetries.transcription).toBe(1);
      expect(canRetryStage(afterRetry1, "transcription")).toBe(true);

      const afterRetry2 = incrementStageRetry(afterRetry1, "transcription");
      expect(afterRetry2.stageRetries.transcription).toBe(2);
      expect(canRetryStage(afterRetry2, "transcription")).toBe(true);

      const afterRetry3 = incrementStageRetry(afterRetry2, "transcription");
      expect(afterRetry3.stageRetries.transcription).toBe(3);
      expect(canRetryStage(afterRetry3, "transcription")).toBe(false);
    });

    it("tracks retries independently per stage", () => {
      const job: VoicePipelineJob = {
        ...baseJob(),
        currentState: "soap_failed",
        stageRetries: { transcription: 2, soap: 0, summary: 0 },
      };

      expect(canRetryStage(job, "transcription")).toBe(true);
      expect(canRetryStage(job, "soap")).toBe(true);

      const afterSoapRetry = incrementStageRetry(job, "soap");
      expect(afterSoapRetry.stageRetries.soap).toBe(1);
      expect(afterSoapRetry.stageRetries.transcription).toBe(2);
    });

    it("blocks retry when stage has reached max attempts", () => {
      const job: VoicePipelineJob = {
        ...baseJob(),
        stageRetries: { transcription: 3, soap: 3, summary: 3 },
      };

      expect(canRetryStage(job, "transcription")).toBe(false);
      expect(canRetryStage(job, "soap")).toBe(false);
      expect(canRetryStage(job, "summary")).toBe(false);
    });
  });
});
