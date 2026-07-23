import { z } from "zod";

const patientSexSchema = z.enum([
  "female",
  "male",
  "other",
  "prefer_not_to_say",
]);

const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD")
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const optionalTextSchema = z
  .string()
  .trim()
  .min(1)
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

const conditionTagsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(32),
  )
  .max(8);

export const createPatientSchema = z.object({
  fullName: z.string().trim().min(1),
  dateOfBirth: dateOfBirthSchema.optional().nullable(),
  sex: patientSexSchema.optional().nullable(),
  phone: optionalTextSchema.optional().nullable(),
  email: optionalTextSchema.optional().nullable(),
  addressLine: optionalTextSchema.optional().nullable(),
  clinicalNotes: z
    .string()
    .trim()
    .min(1)
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value))
    .optional()
    .nullable(),
  conditionTags: conditionTagsSchema.optional(),
});

export const updatePatientSchema = z
  .object({
    fullName: z.string().trim().min(1).optional(),
    dateOfBirth: dateOfBirthSchema.optional().nullable(),
    sex: patientSexSchema.optional().nullable(),
    phone: optionalTextSchema.optional().nullable(),
    email: optionalTextSchema.optional().nullable(),
    addressLine: optionalTextSchema.optional().nullable(),
    clinicalNotes: z
      .string()
      .trim()
      .min(1)
      .or(z.literal(""))
      .transform((value) => (value === "" ? null : value))
      .optional()
      .nullable(),
    conditionTags: conditionTagsSchema.optional(),
  })
  .refine(
    (value) =>
      Object.values(value).some((field) => field !== undefined),
    {
      message: "At least one patient field is required",
    },
  );

export const archivePatientSchema = z.object({
  archived: z.boolean(),
});

const listQueryIncludeArchivedSchema = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .optional()
  .transform((value) => value === true || value === "true");

export const listPatientsQuerySchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
  includeArchived: listQueryIncludeArchivedSchema,
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
});

export const patientPathParamsSchema = z.object({
  patientId: z.string().trim().min(1),
});
