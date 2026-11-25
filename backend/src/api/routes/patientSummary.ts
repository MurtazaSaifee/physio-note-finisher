import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { getManualNote } from "../../domain/notes/noteService.js";
import {
  NoteNotFoundError,
  SessionNotFoundError,
} from "../../domain/notes/noteService.js";
import {
  generatePatientSummary,
  savePatientSummary,
} from "../../domain/voice/patientSummaryService.js";
import type { PatientSummaryProvider } from "../../domain/voice/providers/providerTypes.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import { createAuthRateLimitMiddleware } from "../middleware/rateLimit.js";
import { requirePatientAiConsent } from "../middleware/requirePatientAiConsent.js";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "patientSummaryRoutes" });

const summaryGenerateBodySchema = z
  .object({
    patientId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
  })
  .strict();

const summarySaveBodySchema = z
  .object({
    patientId: z.string().trim().min(1),
    sessionId: z.string().trim().min(1),
    patientSummary: z.string().trim().min(1).max(2000),
  })
  .strict();

async function authorizeSummaryAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  await authorizeClinic(request, reply);
}

function summaryErrorResponse(error: unknown): { statusCode: number; error: string } {
  if (error instanceof SessionNotFoundError || error instanceof NoteNotFoundError) {
    return { statusCode: 404, error: error.message };
  }

  return { statusCode: 500, error: "Patient summary request failed" };
}

export function registerPatientSummaryRoutes(
  app: FastifyInstance,
  provider?: PatientSummaryProvider,
): void {
  const rateLimits = createAuthRateLimitMiddleware(app);

  app.route({
    method: "POST",
    url: "/api/v1/voice/summary/generate",
    preHandler: [authorizeSummaryAccess, rateLimits.llmGenerateRateLimit],
    async handler(request, reply) {
      const body = parseOrBadRequest(summaryGenerateBodySchema, request.body ?? {});
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      if (
        !(await requirePatientAiConsent(
          authenticated.auth.clinicId,
          body.data.patientId,
          reply,
        ))
      ) {
        return;
      }
      try {
        const note = await getManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: body.data.patientId,
          sessionId: body.data.sessionId,
        });

        const patientSummary = await generatePatientSummary(note.sections, {
          provider,
        });
        await savePatientSummary({
          clinicId: authenticated.auth.clinicId,
          sessionId: body.data.sessionId,
          summaryText: patientSummary,
        });

        return reply.send({
          success: true,
          data: {
            patientId: body.data.patientId,
            sessionId: body.data.sessionId,
            patientSummary,
          },
        });
      } catch (error) {
        const response = summaryErrorResponse(error);

        logger.error("patient_summary.generate.failed", {
          requestId: request.id,
          clinicId: authenticated.auth.clinicId,
          patientId: body.data.patientId,
          sessionId: body.data.sessionId,
          errorClass: "PatientSummaryFailure",
          errorCode: "patient_summary_generation_failed",
        });

        return reply.code(response.statusCode).send({ error: response.error });
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/voice/summary/save",
    preHandler: [authorizeSummaryAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(summarySaveBodySchema, request.body ?? {});
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      try {
        await getManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: body.data.patientId,
          sessionId: body.data.sessionId,
        });

        const saved = await savePatientSummary({
          clinicId: authenticated.auth.clinicId,
          sessionId: body.data.sessionId,
          summaryText: body.data.patientSummary,
        });

        return reply.send({
          success: true,
          data: {
            patientId: body.data.patientId,
            sessionId: body.data.sessionId,
            patientSummary: saved.patientSummary,
          },
        });
      } catch (error) {
        const response = summaryErrorResponse(error);

        logger.error("patient_summary.save.failed", {
          requestId: request.id,
          clinicId: authenticated.auth.clinicId,
          patientId: body.data.patientId,
          sessionId: body.data.sessionId,
          errorClass: "PatientSummaryFailure",
          errorCode: "patient_summary_save_failed",
        });

        return reply.code(response.statusCode).send({ error: response.error });
      }
    },
  });
}
