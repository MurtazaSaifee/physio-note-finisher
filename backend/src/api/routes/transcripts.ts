import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  InvalidTranscriptPayloadError,
  readTranscriptForJob,
} from "../../domain/voice/transcriptService.js";
import {
  defaultStore,
  VoiceJobNotFoundError,
  VoiceTranscriptNotFoundError,
  type VoiceJobStore,
} from "../../domain/voice/voiceJobService.js";
import { voiceJobParamsSchema } from "../../domain/voice/voiceJobSchemas.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";

async function authorizeVoiceTranscriptAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  await authorizeClinic(request, reply);
}

export function registerTranscriptRoutes(
  app: FastifyInstance,
  store?: VoiceJobStore,
): void {
  const jobStore = store ?? defaultStore;

  app.route({
    method: "GET",
    url: "/api/v1/voice/jobs/:jobId/transcript",
    preHandler: [authorizeVoiceTranscriptAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(voiceJobParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const requestedClinicId =
        typeof request.headers["x-clinic-id"] === "string"
          ? request.headers["x-clinic-id"].trim()
          : "";

      if (!requestedClinicId || requestedClinicId !== request.auth?.clinicId) {
        return reply.code(403).send({ error: "Forbidden" });
      }

      try {
        const data = await readTranscriptForJob(
          jobStore,
          params.data.jobId,
          request.auth!.clinicId,
        );
        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof VoiceJobNotFoundError) {
          return reply.code(404).send({ error: "Voice job not found" });
        }

        if (error instanceof VoiceTranscriptNotFoundError) {
          return reply.code(404).send({ error: "Transcript not found" });
        }

        if (error instanceof InvalidTranscriptPayloadError) {
          return reply.code(400).send({ error: "Invalid transcript payload" });
        }

        throw error;
      }
    },
  });
}
