import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { createLogger } from "../../observability/logger.js";
import { dashboardQuerySchema } from "../../domain/dashboard/dashboardSchemas.js";
import { listDashboardSessions } from "../../domain/dashboard/dashboardService.js";
import type { DashboardFilters } from "../../../../shared/contracts/dashboard.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";

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

async function authorizeDashboardAccess(
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
    logger.warn("protected.dashboard.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);
  if (reply.sent) {
    logger.warn("protected.dashboard.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  app.route({
    method: "GET",
    url: "/api/v1/dashboard/sessions",
    preHandler: [authorizeDashboardAccess],
    async handler(request, reply) {
      const query = parseOrBadRequest(dashboardQuerySchema, request.query);
      if (!query.success) {
        return sendInvalidPayload(reply, "Invalid dashboard payload", query.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const filters: DashboardFilters = {};

      if (query.data.date !== undefined) {
        filters.date = query.data.date;
      }

      if (query.data.timezoneOffset !== undefined) {
        filters.timezoneOffset = query.data.timezoneOffset;
      }

      if (query.data.patientId !== undefined) {
        filters.patientId = query.data.patientId;
      }

      if (query.data.noteStatus !== undefined) {
        filters.noteStatus = query.data.noteStatus;
      }

      if (query.data.search !== undefined) {
        filters.search = query.data.search;
      }

      if (query.data.page !== undefined) {
        filters.page = query.data.page;
      }

      if (query.data.pageSize !== undefined) {
        filters.pageSize = query.data.pageSize;
      }

      const data = await listDashboardSessions({
        clinicId: authenticated.auth.clinicId,
        filters,
      });

      return reply.send({ success: true, data });
    },
  });
}
