import { z } from "zod";

const templateCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(80);
const templateSourceSchema = z.enum(["built_in", "custom"]);
const templateApplyModeSchema = z.enum(["fillBlank", "replaceAll"]);

const optionalTextSchema = z
  .string()
  .trim()
  .min(1)
  .or(z.literal(""))
  .or(z.null())
  .transform((value) => (value === "" ? null : value));

export const soapSectionsSchema = z
  .object({
    subjective: optionalTextSchema,
    objective: optionalTextSchema,
    assessment: optionalTextSchema,
    plan: optionalTextSchema,
  })
  .strict();

export const createManualNoteSchema = z
  .object({
    startedAt: z.string().datetime({ offset: true }),
    visitType: z.string().trim().min(1),
    sections: soapSectionsSchema,
    templateKey: z.string().trim().min(1).optional().nullable(),
    templateApplyMode: templateApplyModeSchema.optional().nullable(),
  })
  .strict();

export const saveManualNoteSchema = z
  .object({
    sections: soapSectionsSchema,
    templateKey: z.string().trim().min(1).optional().nullable(),
    templateApplyMode: templateApplyModeSchema.optional().nullable(),
  })
  .strict();

export const patientNoteParamsSchema = z
  .object({
    patientId: z.string().trim().min(1),
  })
  .strict();

export const patientSessionNoteParamsSchema = z
  .object({
    patientId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
  })
  .strict();

export const conditionTemplateListParamsSchema = z
  .object({
    category: templateCategorySchema.optional(),
    query: z
      .string()
      .trim()
      .min(1)
      .optional(),
    patientId: z
      .string()
      .trim()
      .min(1)
      .optional(),
    limit: z.coerce.number().int().positive().max(20).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
  })
  .strict();

const templateSectionWriteSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (typeof value === "string" && value.length > 0 ? value : null));

export const customTemplateSectionsSchema = z
  .object({
    subjective: templateSectionWriteSchema,
    objective: templateSectionWriteSchema,
    assessment: templateSectionWriteSchema,
    plan: templateSectionWriteSchema,
  })
  .strict()
  .superRefine((sections, ctx) => {
    const hasAnyContent = Object.values(sections).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
    if (!hasAnyContent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one SOAP section must be non-empty",
        path: ["sections"],
      });
    }
  });

export const createCustomTemplateSchema = z
  .object({
    name: z.string().trim().min(1),
    categories: z.array(templateCategorySchema).min(1),
    sections: customTemplateSectionsSchema,
    source: templateSourceSchema.optional(),
    applyMode: templateApplyModeSchema.optional(),
    ownerUserId: z.never().optional(),
    ownerClinicId: z.never().optional(),
  })
  .strict();

export const updateCustomTemplateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    categories: z.array(templateCategorySchema).min(1).optional(),
    sections: customTemplateSectionsSchema.optional(),
    source: templateSourceSchema.optional(),
    applyMode: templateApplyModeSchema.optional(),
    ownerUserId: z.never().optional(),
    ownerClinicId: z.never().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.name !== undefined ||
      input.categories !== undefined ||
      input.sections !== undefined,
    { message: "At least one mutable field is required" },
  );
