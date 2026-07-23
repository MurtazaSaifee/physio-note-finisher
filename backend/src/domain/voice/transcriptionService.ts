import type { VoiceTranscriptPayload } from "../../../../shared/contracts/voice.js";
import type { SttProvider } from "./providers/providerTypes.js";
import { getObject } from "../../infrastructure/storage/localStorageProvider.js";
import {
  getVoiceJobStatus,
  markVoiceJobFailed,
  markVoiceJobProcessing,
  markVoiceJobSucceeded,
  saveVoiceJobTranscript,
  type VoiceJobRecord,
  type VoiceJobStore,
} from "./voiceJobService.js";

function isStrictVoiceRuntime(): boolean {
  return process.env.APP_ENV === "staging" || process.env.APP_ENV === "production";
}

export async function startTranscription(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  return markVoiceJobProcessing(store, jobId, clinicId);
}

export async function completeTranscription(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  return markVoiceJobSucceeded(store, jobId, clinicId);
}

export async function failTranscription(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
  reason: string,
): Promise<VoiceJobRecord> {
  return markVoiceJobFailed(store, jobId, clinicId, reason);
}

/**
 * Execute the transcription stage with an optional STT provider.
 * Downloads audio from storage, calls the provider, saves the transcript,
 * and marks the job as succeeded.
 * Local/test runtimes may still fall back without a provider; managed runtimes
 * require a real provider and a persisted transcript before success.
 */
export async function runTranscription(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
  sttProvider?: SttProvider,
): Promise<VoiceJobRecord> {
  if (!sttProvider && isStrictVoiceRuntime()) {
    throw new Error("STT provider is required for voice transcription in managed runtimes");
  }

  if (sttProvider) {
    const job = await getVoiceJobStatus(store, jobId, clinicId);
    if (!job.storageKey) {
      return markVoiceJobFailed(
        store,
        jobId,
        clinicId,
        "Missing uploaded audio storage key",
      );
    }

    // Download audio from the local storage provider.
    const audioBuffer = await getObject(job.storageKey);

    // Call STT provider
    const transcribeOptions = typeof job.durationSeconds === "number"
      ? { audioDurationSeconds: job.durationSeconds }
      : {};
    const result = await sttProvider.transcribe(audioBuffer, transcribeOptions);
    if (!result.transcript.trim()) {
      throw new Error("STT provider returned an empty transcript");
    }

    // Map provider TranscriptionResult to domain VoiceTranscriptPayload
    const transcriptPayload: VoiceTranscriptPayload = {
      transcriptStatus: "ready",
      text: result.transcript,
      segments: result.segments.map((s) => ({
        startMs: Math.round(s.startTimeSeconds * 1000),
        endMs: Math.round(s.endTimeSeconds * 1000),
        text: s.text,
        words: [],
      })),
    };

    // Save transcript before advancing stage
    await saveVoiceJobTranscript(store, jobId, clinicId, transcriptPayload);
  }

  const persisted = await getVoiceJobStatus(store, jobId, clinicId);
  if (isStrictVoiceRuntime() && !persisted.transcript?.text?.trim()) {
    throw new Error("Transcription stage cannot succeed without a transcript");
  }

  return markVoiceJobSucceeded(store, jobId, clinicId);
}

export async function readTranscriptionJob(
  store: VoiceJobStore,
  jobId: string,
  clinicId: string,
): Promise<VoiceJobRecord> {
  return getVoiceJobStatus(store, jobId, clinicId);
}
