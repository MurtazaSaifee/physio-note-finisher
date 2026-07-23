import { z } from "zod";

const optionalTextSchema = z
  .string()
  .trim()
  .min(1)
  .or(z.literal(""))
  .transform((value) => (value === "" ? null : value));

export const createAppointmentSchema = z.object({
  patientId: z.string().trim().min(1).nullable(),
  patientNameSnapshot: optionalTextSchema.optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(480),
  notes: optionalTextSchema.optional().nullable(),
}).strict();

export const updateAppointmentSchema = z.object({
  patientId: z.string().trim().min(1).optional().nullable(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.number().int().min(1).max(480).optional(),
  notes: optionalTextSchema.optional().nullable(),
}).strict();

export const rescheduleAppointmentSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
});

export const appointmentParamsSchema = z.object({
  appointmentId: z.string().trim().min(1),
});

export const listAppointmentsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timezoneOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/).optional(),
});

export const appointmentHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const startSessionFromAppointmentSchema = z.object({
  sessionType: z.string().trim().min(1),
}).strict();
