import { z } from "zod";

const allowedMimeTypes = [
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

export const voiceUploadRequestSchema = z.object({
  clinicId: z.string().trim().min(1),
  patientId: z.string().trim().min(1),
  mimeType: z.enum(allowedMimeTypes),
  fileName: z.string().trim().min(1),
  fileSizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
  durationSeconds: z.number().int().min(5).max(300),
});

export const voiceUploadCompleteParamsSchema = z.object({
  uploadId: z.string().trim().min(1),
});

export const voiceUploadCompleteRequestSchema = z.object({
  clinicId: z.string().trim().min(1),
  patientId: z.string().trim().min(1),
  uploadId: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  durationSeconds: z.number().int().min(5).max(300),
});
