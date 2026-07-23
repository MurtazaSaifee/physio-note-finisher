import {
  advanceToNextPipelineStage,
  createVoiceJobStore,
  markVoiceJobFailed,
  type VoiceJobStore,
  type VoicePipelineStageState,
} from "../domain/voice/voiceJobService.js";
import type { VoiceProviders } from "../domain/voice/providers/providerRegistry.js";
import {
  failTranscription,
  runTranscription,
  startTranscription,
} from "../domain/voice/transcriptionService.js";
import { runSoapGeneration } from "../domain/voice/soapGenerationService.js";
import { runSummaryGeneration } from "../domain/voice/patientSummaryService.js";
import type {
  ClinicalNoteProvider,
  PatientSummaryProvider,
  SttProvider,
} from "../domain/voice/providers/providerTypes.js";
import { ProviderError } from "../domain/voice/providers/providerErrors.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger({ component: "voiceWorker" });

const JOB_QUEUED_STAGE: Record<string, VoicePipelineStageState> = {
  transcription: "queued_transcription",
  soap: "queued_soap",
  summary: "queued_summary",
};

const STAGE_ORDER: VoicePipelineStageState[] = [
  "created",
  "uploading",
  "uploaded",
  "queued_transcription",
  "transcribing",
  "transcription_succeeded",
  "queued_soap",
  "generating_soap",
  "soap_succeeded",
  "queued_summary",
  "generating_summary",
  "summary_succeeded",
  "succeeded",
];

const QUEUED_TO_FAILED_STAGE: Partial<Record<VoicePipelineStageState, VoicePipelineStageState>> = {
  queued_transcription: "transcription_failed",
  queued_soap: "soap_failed",
  queued_summary: "summary_failed",
};

export type StageQueue = {
  add(
    name: string,
    data: unknown,
    opts?: {
      attempts?: number;
      backoff?: { type: "exponential" | "fixed"; delay: number };
      jobId?: string;
    },
  ): Promise<{ id: string }>;
};

function getStageJobId(data: unknown, fallback?: string): string {
  if (
    data &&
    typeof data === "object" &&
    "jobId" in data &&
    typeof data.jobId === "string" &&
    data.jobId.trim()
  ) {
    return data.jobId;
  }
  if (fallback?.trim()) {
    return fallback;
  }
  throw new Error("jobId is required for stage queue messages");
}

export function createInMemoryStageQueue(): StageQueue {
  return {
    async add(_name, _data, opts) {
      return { id: opts?.jobId ?? "mock-job-id" };
    },
  };
}

export function createLocalStageQueue(input: {
  store: VoiceJobStore;
  voiceProviders: VoiceProviders | undefined;
}): StageQueue {
  const queue: StageQueue = {
    async add(name, data, opts) {
      const jobId = getStageJobId(data, opts?.jobId);
      try {
        await processVoicePipelineJob(
          name,
          jobId,
          input.store,
          input.voiceProviders?.sttProvider,
          input.voiceProviders?.clinicalNoteProvider,
          input.voiceProviders?.patientSummaryProvider,
          queue,
        );
      } catch {
        logger.error("voice.local_queue.job_failed", {
          jobName: name,
          jobId,
          errorCode: "voice_pipeline_job_failed",
          errorClass: "VoicePipelineFailure",
        });
      }
      return { id: opts?.jobId ?? jobId };
    },
  };

  return queue;
}

export type VoiceWorker = {
  startJob(jobId: string, clinicId: string): Promise<void>;
  completeTranscriptionStage(
    jobId: string,
    clinicId: string,
    sttProvider?: SttProvider,
  ): Promise<void>;
  completeSoapStage(
    jobId: string,
    clinicId: string,
    provider?: ClinicalNoteProvider,
  ): Promise<void>;
  completeSummaryStage(
    jobId: string,
    clinicId: string,
    provider?: PatientSummaryProvider,
  ): Promise<void>;
  failJob(jobId: string, clinicId: string, reason: string): Promise<void>;
};

export function registerVoiceWorker(
  store: VoiceJobStore = createVoiceJobStore(),
): VoiceWorker {
  return {
    async startJob(jobId, clinicId) {
      await startTranscription(store, jobId, clinicId);
    },
    async completeTranscriptionStage(jobId, clinicId, sttProvider) {
      await runTranscription(store, jobId, clinicId, sttProvider);
    },
    async completeSoapStage(jobId, clinicId, provider) {
      await runSoapGeneration(store, jobId, clinicId, provider);
    },
    async completeSummaryStage(jobId, clinicId, provider) {
      await runSummaryGeneration(store, jobId, clinicId, provider);
    },
    async failJob(jobId, clinicId, reason) {
      await failTranscription(store, jobId, clinicId, reason);
    },
  };
}

export async function processVoicePipelineJob(
  jobName: string,
  jobId: string,
  store: VoiceJobStore,
  sttProvider?: SttProvider,
  clinicalNoteProvider?: ClinicalNoteProvider,
  patientSummaryProvider?: PatientSummaryProvider,
  stageQueue?: StageQueue,
): Promise<void> {
  const jobRecord = await store.find(jobId);
  if (!jobRecord) {
    throw new Error(`Voice job not found: ${jobId}`);
  }
  if (jobRecord.stageState === "succeeded" || jobRecord.status === "failed") {
    return;
  }

  const expectedQueuedStage = JOB_QUEUED_STAGE[jobName];
  if (!expectedQueuedStage) {
    logger.warn("voice.worker.unknown_job_name", { jobName, jobId });
    throw new Error(`Unknown job name: ${jobName}`);
  }

  if (jobRecord.stageState !== expectedQueuedStage) {
    const currentIndex = jobRecord.stageState ? STAGE_ORDER.indexOf(jobRecord.stageState) : -1;
    const expectedIndex = STAGE_ORDER.indexOf(expectedQueuedStage);
    if (currentIndex > expectedIndex) {
      logger.info("voice.worker.stale_stage_message_ignored", {
        jobName,
        jobId,
        persistedStage: jobRecord.stageState,
        expectedQueuedStage,
      });
      return;
    }
    throw new Error(
      `JobName ${jobName} does not match queued stage ${jobRecord.stageState ?? "unknown"}`,
    );
  }

  const { clinicId, uploadId } = jobRecord;
  const voiceWorker = registerVoiceWorker(store);

  logger.info("voice.worker.job_started", {
    jobName,
    jobId,
    clinicId,
    uploadId,
  });

  try {
    await voiceWorker.startJob(jobId, clinicId);

    switch (jobName) {
      case "transcription": {
        await voiceWorker.completeTranscriptionStage(jobId, clinicId, sttProvider);
        const advanced = await advanceToNextPipelineStage(store, jobId, clinicId);
        if (advanced.stageState === "queued_soap") {
          await (stageQueue ?? createLocalStageQueue({ store, voiceProviders: undefined })).add(
            "soap",
            { jobId, clinicId, uploadId },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 1000 },
              jobId: `${jobId}-soap`,
            },
          );
        }
        break;
      }
      case "soap": {
        await voiceWorker.completeSoapStage(jobId, clinicId, clinicalNoteProvider);
        const advanced = await advanceToNextPipelineStage(store, jobId, clinicId);
        if (advanced.stageState === "queued_summary") {
          await (stageQueue ?? createLocalStageQueue({ store, voiceProviders: undefined })).add(
            "summary",
            { jobId, clinicId, uploadId },
            {
              attempts: 3,
              backoff: { type: "exponential", delay: 1000 },
              jobId: `${jobId}-summary`,
            },
          );
        }
        break;
      }
      case "summary": {
        await voiceWorker.completeSummaryStage(jobId, clinicId, patientSummaryProvider);
        await advanceToNextPipelineStage(store, jobId, clinicId);
        break;
      }
    }

    logger.info("voice.worker.job_completed", { jobName, jobId, clinicId });
  } catch (error) {
    const reason = error instanceof ProviderError
      ? "Voice provider request failed"
      : "Voice pipeline job failed";
    const errorCode =
      error instanceof ProviderError ? "voice_provider_request_failed" : "voice_pipeline_job_failed";
    logger.error("voice.worker.job_failed", {
      jobName,
      jobId,
      clinicId,
      errorCode,
      errorClass: error instanceof ProviderError ? "ProviderFailure" : "VoicePipelineFailure",
      isRetryable: error instanceof ProviderError ? error.isRetryable : undefined,
    });
    const latest = await store.find(jobId);
    if (latest?.status === "processing") {
      await markVoiceJobFailed(store, jobId, clinicId, reason);
    } else if (
      latest?.status === "queued" &&
      latest.stageState?.startsWith("queued_")
    ) {
      const failedStage = QUEUED_TO_FAILED_STAGE[latest.stageState];
      await store.save({
        ...latest,
        status: "failed",
        stageState: failedStage ?? latest.stageState,
        errorMessage: reason,
        updatedAt: new Date().toISOString(),
      });
    }
    throw error;
  }
}
