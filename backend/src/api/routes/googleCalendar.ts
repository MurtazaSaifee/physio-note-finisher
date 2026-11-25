import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  buildGoogleConnectUrl,
  consumeGoogleCalendarOAuthState,
  disconnectGoogleCalendar,
  exchangeGoogleCode,
  getGoogleCalendarConnectionStatus,
  issueGoogleCalendarOAuthState,
} from "../../domain/google-calendar/googleCalendarAuthService.js";
import { isLocalGoogleCalendarMode } from "../../domain/google-calendar/googleCalendarRuntime.js";

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

async function authorizeGoogleCalendarAccess(
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
    logger.warn("protected.google-calendar.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.google-calendar.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

const localExchangeCodeSchema = z.object({
  code: z.string().min(1),
});

const remoteExchangeCodeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export function registerGoogleCalendarRoutes(app: FastifyInstance): void {
  app.route({
    method: "GET",
    url: "/api/v1/google-calendar/connect-url",
    preHandler: [authorizeGoogleCalendarAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      const state = await issueGoogleCalendarOAuthState(
        authenticated.auth.clinicId,
        authenticated.auth.sub,
      );
      const url = buildGoogleConnectUrl(
        authenticated.auth.clinicId,
        authenticated.auth.sub,
        state,
      );

      return reply.send({ success: true, data: { url } });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/google-calendar/exchange",
    preHandler: [authorizeGoogleCalendarAccess],
    async handler(request, reply) {
      const localMode = isLocalGoogleCalendarMode();
      if (localMode) {
        const parsed = localExchangeCodeSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "Invalid payload" });
        }

        const authenticated = request as AuthenticatedRequest;

        try {
          await consumeGoogleCalendarOAuthState(
            authenticated.auth.clinicId,
            authenticated.auth.sub,
          );

          const data = await exchangeGoogleCode(
            authenticated.auth.clinicId,
            authenticated.auth.sub,
            parsed.data.code,
          );

          return reply.send({ success: true, data });
        } catch (error) {
          const logger = createLogger({ requestId: request.id });
          logger.warn("google-calendar.exchange.failed", {
            errorClass: error instanceof Error ? error.name : "Unknown",
          });
          return reply.code(400).send({ error: "Failed to exchange Google code" });
        }
      }

      const parsed = remoteExchangeCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid payload" });
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        await consumeGoogleCalendarOAuthState(
          authenticated.auth.clinicId,
          authenticated.auth.sub,
          parsed.data.state,
        );

        const data = await exchangeGoogleCode(
          authenticated.auth.clinicId,
          authenticated.auth.sub,
          parsed.data.code,
        );

        return reply.send({ success: true, data });
      } catch (error) {
        const logger = createLogger({ requestId: request.id });
        logger.warn("google-calendar.exchange.failed", {
          errorClass: error instanceof Error ? error.name : "Unknown",
        });
        return reply.code(400).send({ error: "Failed to exchange Google code" });
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/google-calendar/status",
    preHandler: [authorizeGoogleCalendarAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      const data = await getGoogleCalendarConnectionStatus(
        authenticated.auth.clinicId,
        authenticated.auth.sub,
      );

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/google-calendar/disconnect",
    preHandler: [authorizeGoogleCalendarAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      await disconnectGoogleCalendar(
        authenticated.auth.clinicId,
        authenticated.auth.sub,
      );

      return reply.send({ success: true });
    },
  });
}
