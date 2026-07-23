import { z } from "zod";

import type { VoiceTranscriptResponse } from "../../../../shared/contracts/voice.js";
import {
  getVoiceJobStatus,
  readVoiceJobTranscript,
  type VoiceJobStore,
} from "./voiceJobService.js";

export class InvalidTranscriptPayloadError extends Error {
  constructor() {
    super("Invalid transcript payload");
    this.name = "InvalidTranscriptPayloadError";
  }
}

const transcriptWordSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().trim().min(1),
}).refine((word) => word.endMs >= word.startMs, {
  message: "Invalid transcript payload",
});

const transcriptSegmentSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  text: z.string().trim().min(1),
  words: z.array(transcriptWordSchema),
}).refine((segment) => segment.endMs >= segment.startMs, {
  message: "Invalid transcript payload",
});

const transcriptSchema = z.object({
  transcriptStatus: z.literal("ready"),
  text: z.string().trim().min(1),
  segments: z.array(transcriptSegmentSchema),
});

export async function readTranscriptForJob(
  store: VoiceJobStore | undefined,
  jobId: string,
  clinicId: string,
): Promise<VoiceTranscriptResponse> {
  const job = await getVoiceJobStatus(store, jobId, clinicId);
  const transcript = await readVoiceJobTranscript(store, jobId, clinicId);

  const parsed = transcriptSchema.safeParse(transcript);
  if (!parsed.success) {
    throw new InvalidTranscriptPayloadError();
  }
  const audioUrl =
    job.audioUrl ??
    (job.storageKey ? `/api/v1/voice/uploads/${job.uploadId}/binary` : null);

  return {
    jobId: job.jobId,
    clinicId: job.clinicId,
    patientId: job.patientId,
    speakerMode: "single",
    audioUrl,
    ...parsed.data,
  };
}
