import { z } from "zod";

export const voiceJobParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

export const retryVoiceJobBodySchema = z.object({
  clinicId: z.string().trim().min(1).optional(),
});

export const updateTranscriptBodySchema = z.object({
  transcriptText: z.string().trim().min(1),
});

// ---- Stage-state schemas (Phase 11) ----

export const voicePipelineStageStateSchema = z.enum([
  "created",
  "uploading",
  "uploaded",
  "queued_transcription",
  "transcribing",
  "transcription_succeeded",
  "transcription_failed",
  "queued_soap",
  "generating_soap",
  "soap_succeeded",
  "soap_failed",
  "queued_summary",
  "generating_summary",
  "summary_succeeded",
  "summary_failed",
  "succeeded",
]);

export const stageRetriesSchema = z.object({
  transcription: z.number().int().min(0).max(3),
  soap: z.number().int().min(0).max(3),
  summary: z.number().int().min(0).max(3),
});

export const voicePipelineStatusResponseSchema = z.object({
  jobId: z.string(),
  clinicId: z.string(),
  patientId: z.string(),
  uploadId: z.string(),
  currentStage: voicePipelineStageStateSchema,
  stageRetries: stageRetriesSchema,
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const voicePipelineStageEventSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  clinicId: z.string(),
  fromState: voicePipelineStageStateSchema.nullable(),
  toState: voicePipelineStageStateSchema,
  actor: z.string(),
  source: z.string(),
  occurredAt: z.string().datetime(),
});
