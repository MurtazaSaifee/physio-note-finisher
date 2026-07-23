import { z } from "zod";

export const auditEventTypeSchema = z.enum([
  "noteCreated",
  "sectionEdited",
  "sectionRegenerated",
  "noteFinalized",
  "noteReopened",
  "noteExported",
]);

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const sectionEditMetadataSchema = z.object({
  sectionName: z.enum(["subjective", "objective", "assessment", "plan"]).optional(),
});

export const regenerationMetadataSchema = z.object({
  sectionName: z.enum(["subjective", "objective", "assessment", "plan"]),
});

export const exportMetadataSchema = z.object({
  exportAction: z.string().optional(),
  exportType: z.string().optional(),
  format: z.string().optional(),
});

export const auditEventMetadataSchema = z.union([
  sectionEditMetadataSchema,
  regenerationMetadataSchema,
  exportMetadataSchema,
]);

export type AuditEventMetadata = z.infer<typeof auditEventMetadataSchema>;

export interface AuditEventResponse {
  id: string;
  eventType: AuditEventType;
  sessionId: string;
  userId: string;
  timestamp: string;
  metadata: AuditEventMetadata | null;
  user?: {
    firstName: string;
    lastName: string;
  };
}

export interface AuditHistoryResponse {
  sessionId: string;
  events: AuditEventResponse[];
}

export const auditHistoryParamsSchema = z.object({
  sessionId: z.string().min(1),
});
