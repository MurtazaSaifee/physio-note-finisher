import { z } from "zod";

import { soapSectionsSchema } from "../notes/noteSchemas.js";

export const soapSectionKeySchema = z.enum([
  "subjective",
  "objective",
  "assessment",
  "plan",
]);

const cleanTextSchema = z.string().trim().min(1);

export const soapGenerationBodySchema = z
  .object({
    patientId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    transcriptText: cleanTextSchema,
  })
  .strict();

export const soapSectionRegenerationBodySchema = z
  .object({
    patientId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    transcriptText: cleanTextSchema,
    section: soapSectionKeySchema,
    hint: z.string().trim().max(280).optional(),
  })
  .strict();

export const generatedSoapSectionsSchema = soapSectionsSchema
  .transform((sections) => ({
    subjective: sections.subjective ?? "",
    objective: sections.objective ?? "",
    assessment: sections.assessment ?? "",
    plan: sections.plan ?? "",
  }))
  .pipe(
    z.object({
      subjective: z.string().trim().min(1),
      objective: z.string().trim().min(1),
      assessment: z.string().trim().min(1),
      plan: z.string().trim().min(1),
    }),
  );

export const regeneratedSoapSectionsSchema = soapSectionsSchema
  .transform((sections) => ({
    subjective: sections.subjective ?? "",
    objective: sections.objective ?? "",
    assessment: sections.assessment ?? "",
    plan: sections.plan ?? "",
  }))
  .pipe(
    z.object({
      subjective: z.string(),
      objective: z.string(),
      assessment: z.string(),
      plan: z.string(),
    }),
  );
