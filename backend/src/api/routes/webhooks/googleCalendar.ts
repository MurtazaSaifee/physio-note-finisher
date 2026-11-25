import type { FastifyInstance } from "fastify";

import { verifyWebhookChannel } from "../../../domain/google-calendar/googleCalendarWebhookService.js";
import {
  enqueueIncrementalSync,
  type GoogleCalendarQueue,
} from "../../../domain/google-calendar/googleCalendarQueue.js";

export function registerGoogleCalendarWebhookRoutes(
  app: FastifyInstance,
  queue: GoogleCalendarQueue,
): void {
  app.route({
    method: "POST",
    url: "/api/v1/webhooks/google-calendar",
    async handler(request, reply) {
      const channelId = request.headers["x-goog-channel-id"] as string | undefined;
      const channelToken = request.headers["x-goog-channel-token"] as string | undefined;
      const resourceId = request.headers["x-goog-resource-id"] as string | undefined;

      if (!channelId || !channelToken || !resourceId) {
        return reply.code(400).send({ error: "Missing webhook headers" });
      }

      const verification = await verifyWebhookChannel(channelId, channelToken);

      if (!verification.valid) {
        return reply.code(401).send({ error: "Invalid channel" });
      }

      await enqueueIncrementalSync(
        queue,
        verification.clinicId,
        verification.userId,
      );

      return reply.code(202).send({ success: true });
    },
  });
}
