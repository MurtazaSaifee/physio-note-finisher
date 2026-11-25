import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { getManualNote } from "../../domain/notes/noteService.js";
import { soapGenerationBodySchema, soapSectionRegenerationBodySchema } from "../../domain/voice/soapGenerationSchemas.js";
import { generateSoapDraft, regenerateSoapSection } from "../../domain/voice/soapGenerationService.js";
import { createAuditEvent } from "../../domain/audit/auditService.js";
import type { ClinicalNoteProvider } from "../../domain/voice/providers/providerTypes.js";
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

async function authorizeSoapGenerationAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  await authorizeClinic(request, reply);
}

export function registerSoapGenerationRoutes(
  app: FastifyInstance,
  provider?: ClinicalNoteProvider,
): void {
  const rateLimits = createAuthRateLimitMiddleware(app);

  app.route({
    method: "POST",
    url: "/api/v1/voice/soap/generate",
    preHandler: [authorizeSoapGenerationAccess, rateLimits.llmGenerateRateLimit],
    async handler(request, reply) {
      const body = parseOrBadRequest(soapGenerationBodySchema, request.body ?? {});
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
      const data = await generateSoapDraft({
        clinicId: authenticated.auth.clinicId,
        patientId: body.data.patientId,
        userId: authenticated.auth.sub,
        sessionId: body.data.sessionId,
        transcriptText: body.data.transcriptText,
        provider,
      });

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/voice/soap/regenerate-section",
    preHandler: [authorizeSoapGenerationAccess, rateLimits.llmRegenerateRateLimit],
    async handler(request, reply) {
      const body = parseOrBadRequest(soapSectionRegenerationBodySchema, request.body ?? {});
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
      const note = await getManualNote({
        clinicId: authenticated.auth.clinicId,
        patientId: body.data.patientId,
        sessionId: body.data.sessionId,
      });
      const data = await regenerateSoapSection({
        clinicId: authenticated.auth.clinicId,
        patientId: body.data.patientId,
        userId: authenticated.auth.sub,
        sessionId: body.data.sessionId,
        transcriptText: body.data.transcriptText,
        targetSection: body.data.section,
        currentSections: {
          subjective: note.sections.subjective ?? "",
          objective: note.sections.objective ?? "",
          assessment: note.sections.assessment ?? "",
          plan: note.sections.plan ?? "",
        },
        ...(body.data.hint ? { hint: body.data.hint } : {}),
      });

      await createAuditEvent({
        eventType: "sectionRegenerated",
        sessionId: body.data.sessionId,
        userId: authenticated.auth.sub,
        clinicId: authenticated.auth.clinicId,
        metadata: { sectionName: body.data.section },
      });

      return reply.send({ success: true, data });
    },
  });
}
