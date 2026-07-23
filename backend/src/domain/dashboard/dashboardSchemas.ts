import { z } from "zod";

const dateFilterSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .transform((value) => (value?.length ? value : undefined));

const patientIdFilterSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => (value?.length ? value : undefined));

const searchFilterSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value?.length ? value : undefined));

const noteStatusFilterSchema = z
  .enum(["draft", "finalized", "reopened", "all"])
  .optional()
  .transform((value) => value ?? "all");

export const dashboardQuerySchema = z.object({
  date: dateFilterSchema,
  timezoneOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/).optional(),
  patientId: patientIdFilterSchema,
  noteStatus: noteStatusFilterSchema,
  search: searchFilterSchema,
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});
