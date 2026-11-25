import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  registerDevicePushToken,
  getDevicePushTokens,
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

async function authorizeDeviceTokenAccess(
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
    logger.warn("protected.device-tokens.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.device-tokens.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

const registerTokenSchema = z.object({
  expoPushToken: z.string().min(1),
  deviceId: z.string().min(1),
});

export function registerDevicePushTokenRoutes(app: FastifyInstance): void {
  app.route({
    method: "POST",
    url: "/api/v1/notifications/push-tokens",
    preHandler: [authorizeDeviceTokenAccess],
    async handler(request, reply) {
      const parsed = registerTokenSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid token payload" });
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await registerDevicePushToken({
          userId: authenticated.auth.sub,
          clinicId: authenticated.auth.clinicId,
          expoPushToken: parsed.data.expoPushToken,
          deviceId: parsed.data.deviceId,
        });

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "InvalidPushTokenError") {
          return reply.code(400).send({ error: "Invalid push token" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/notifications/push-tokens",
    preHandler: [authorizeDeviceTokenAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      const data = await getDevicePushTokens({
        userId: authenticated.auth.sub,
        clinicId: authenticated.auth.clinicId,
      });

      return reply.send({ success: true, data });
    },
  });
}
