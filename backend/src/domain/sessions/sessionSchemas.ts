import { z } from "zod";

const copyForwardSectionSchema = z.enum(["priorPlan", "carryForwardContext"]);

const optionalTextSchema = z
  .string()
  .trim()
  .min(1)
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

export const createSessionEntrySchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  visitType: z.string().trim().min(1),
  noteStatus: z.literal("draft"),
  finalNote: optionalTextSchema.optional().nullable(),
  patientSummary: optionalTextSchema.optional().nullable(),
  priorPlan: optionalTextSchema.optional().nullable(),
  carryForwardContext: optionalTextSchema.optional().nullable(),
});

export const patientSessionParamsSchema = z.object({
  patientId: z.string().trim().min(1),
});

export const patientSessionDetailParamsSchema = z.object({
  patientId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
});

export const copyForwardRequestSchema = z.object({
  selectedSections: z
    .array(copyForwardSectionSchema)
    .min(1)
    .refine((sections) => new Set(sections).size === sections.length, {
      message: "selectedSections must not contain duplicates",
    }),
});
