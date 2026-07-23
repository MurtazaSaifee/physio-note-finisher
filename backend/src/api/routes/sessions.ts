import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import * as copyForwardService from "../../domain/sessions/copyForwardService.js";
import * as sessionTimelineService from "../../domain/sessions/sessionTimelineService.js";
import {
  copyForwardRequestSchema,
  createSessionEntrySchema,
  patientSessionDetailParamsSchema,
  patientSessionParamsSchema,
} from "../../domain/sessions/sessionSchemas.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import type { CreateSessionEntryRequest } from "../../../../shared/contracts/sessions.js";

function readCorrelationId(
  headerValue: string | string[] | undefined,
  requestId: string,
): string {
  if (Array.isArray(headerValue)) {
    return headerValue[0] ?? requestId;
  }

  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }

  return requestId;
}

async function authorizeSessionAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const correlationId = readCorrelationId(
    request.headers["x-correlation-id"],
    request.id,
  );
  const logger = createLogger({
    requestId: request.id,
    correlationId,
  });

  await authenticate(request, reply);

  if (reply.sent) {
    logger.warn("protected.sessions.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.sessions.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}



function buildCreateSessionEntryInput(
  data: z.infer<typeof createSessionEntrySchema>,
): CreateSessionEntryRequest {
  const input: CreateSessionEntryRequest = {
    startedAt: data.startedAt,
    visitType: data.visitType,
    noteStatus: data.noteStatus,
  };

  if (data.finalNote !== undefined) {
    input.finalNote = data.finalNote;
  }

  if (data.patientSummary !== undefined) {
    input.patientSummary = data.patientSummary;
  }

  if (data.priorPlan !== undefined) {
    input.priorPlan = data.priorPlan;
  }

  if (data.carryForwardContext !== undefined) {
    input.carryForwardContext = data.carryForwardContext;
  }

  return input;
}

export function registerSessionRoutes(app: FastifyInstance): void {
  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions",
    preHandler: [authorizeSessionAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid session payload", params.issues);
      }

      const body = parseOrBadRequest(createSessionEntrySchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid session payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await sessionTimelineService.createSessionEntry({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          input: buildCreateSessionEntryInput(body.data),
        });

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        if (error instanceof sessionTimelineService.SessionNotFoundError) {
          return reply.code(404).send({ error: "Session not found" });
        }

        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId/timeline",
    preHandler: [authorizeSessionAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid session payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await sessionTimelineService.listPatientTimeline({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId/sessions/:sessionId",
    preHandler: [authorizeSessionAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionDetailParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid session payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await sessionTimelineService.getPriorSessionDetail({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof sessionTimelineService.SessionNotFoundError) {
          return reply.code(404).send({ error: "Session not found" });
        }

        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/copy-forward",
    preHandler: [authorizeSessionAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionDetailParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid session payload", params.issues);
      }

      const body = parseOrBadRequest(copyForwardRequestSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid session payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await copyForwardService.copyForwardFromSession({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sourceSessionId: params.data.sessionId,
          selectedSections: body.data.selectedSections,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof sessionTimelineService.SessionNotFoundError) {
          return reply.code(404).send({ error: "Session not found" });
        }

        throw error;
      }
    },
  });
}
