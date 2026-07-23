import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  getReminderPreference,
  updateReminderPreference,
} from "../../domain/notifications/reminderPreferenceService.js";

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

async function authorizeNotificationAccess(
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
    logger.warn("protected.notifications.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.notifications.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

const timingOptionSchema = z.enum(["30m", "1h", "2h", "1d"]);

const updatePreferenceSchema = z.object({
  defaultReminderTiming: timingOptionSchema,
  pushEnabled: z.boolean(),
});

export function registerNotificationPreferenceRoutes(app: FastifyInstance): void {
  app.route({
    method: "GET",
    url: "/api/v1/notifications/preferences",
    preHandler: [authorizeNotificationAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      const data = await getReminderPreference({
        userId: authenticated.auth.sub,
        clinicId: authenticated.auth.clinicId,
      });

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "PUT",
    url: "/api/v1/notifications/preferences",
    preHandler: [authorizeNotificationAccess],
    async handler(request, reply) {
      const parsed = updatePreferenceSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid preference payload" });
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await updateReminderPreference({
          userId: authenticated.auth.sub,
          clinicId: authenticated.auth.clinicId,
          defaultReminderTiming: parsed.data.defaultReminderTiming,
          pushEnabled: parsed.data.pushEnabled,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "InvalidReminderTimingError") {
          return reply.code(400).send({ error: "Invalid reminder timing" });
        }

        throw error;
      }
    },
  });
}
