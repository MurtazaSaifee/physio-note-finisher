import { z } from "zod";

export const AudioRetentionPeriodSchema = z.enum(["7d", "30d", "90d", "forever"]);

export type AudioRetentionPeriod = z.infer<typeof AudioRetentionPeriodSchema>;

export const UpdateRetentionPolicyRequestSchema = z.object({
  audioRetentionPeriod: AudioRetentionPeriodSchema,
});

export type UpdateRetentionPolicyRequest = z.infer<
  typeof UpdateRetentionPolicyRequestSchema
>;
