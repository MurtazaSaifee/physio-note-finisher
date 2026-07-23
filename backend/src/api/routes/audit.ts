import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { createLogger } from "../../observability/logger.js";
import { getAuditHistoryForSession } from "../../domain/audit/auditService.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import { auditHistoryParamsSchema } from "../../../../shared/contracts/audit.js";

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

async function authorizeAuditAccess(
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
    logger.warn("protected.audit.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);
  if (reply.sent) {
    logger.warn("protected.audit.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

export function registerAuditRoutes(app: FastifyInstance): void {
  app.route({
    method: "GET",
    url: "/api/v1/audit/sessions/:sessionId",
    preHandler: [authorizeAuditAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(auditHistoryParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid audit request", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const data = await getAuditHistoryForSession({
        sessionId: params.data.sessionId,
        clinicId: authenticated.auth.clinicId,
      });

      return reply.send({ success: true, data });
    },
  });
}
