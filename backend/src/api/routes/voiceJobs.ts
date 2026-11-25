import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  getVoiceJobStatus,
  markVoiceJobQueueFailed,
  retryVoiceJob,
  updateTranscriptText,
  VoiceJobNotFoundError,
  VoiceJobRetryError,
  defaultStore,
  type VoiceJobStore,
} from "../../domain/voice/voiceJobService.js";
import { deleteAudioAndTranscript } from "../../domain/audio/retentionService.js";
import { deleteObject } from "../../infrastructure/s3/s3Client.js";
import {
  retryVoiceJobBodySchema,
  updateTranscriptBodySchema,
  voiceJobParamsSchema,
} from "../../domain/voice/voiceJobSchemas.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import type { StageQueue } from "../../workers/voiceWorker.js";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "voiceJobRoutes" });

async function authorizeVoiceJobAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  await authorizeClinic(request, reply);
}

export function registerVoiceJobRoutes(
  app: FastifyInstance,
  queue?: StageQueue,
  store?: VoiceJobStore,
): void {
  const jobStore = store ?? defaultStore;

  app.route({
    method: "GET",
    url: "/api/v1/voice/jobs/:jobId",
    preHandler: [authorizeVoiceJobAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(voiceJobParamsSchema, request.params, "jobParams");
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await getVoiceJobStatus(
          jobStore,
          params.data.jobId,
          authenticated.auth.clinicId,
        );
        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof VoiceJobNotFoundError) {
          return reply.code(404).send({ error: "Voice job not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/voice/jobs/:jobId/retry",
    preHandler: [authorizeVoiceJobAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(voiceJobParamsSchema, request.params, "retryParams");
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const body = parseOrBadRequest(retryVoiceJobBodySchema, request.body ?? {}, "retryBody");
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await retryVoiceJob(
          jobStore,
          params.data.jobId,
          authenticated.auth.clinicId,
        );

        // D-02: re-enqueue the specific failed stage after successful retry
        if (queue && data.stageState) {
          const stageQueueMap: Record<string, string> = {
            queued_transcription: "transcription",
            queued_soap: "soap",
            queued_summary: "summary",
          };
          const stageName = stageQueueMap[data.stageState];
          if (stageName) {
            try {
              await queue.add(
                stageName,
                {
                  jobId: data.jobId,
                  clinicId: data.clinicId,
                  uploadId: data.uploadId,
                },
                {
                  attempts: 3,
                  backoff: { type: "exponential", delay: 1000 },
                  jobId: `${data.jobId}-${stageName}`,
                },
              );
            } catch {
              const failedJob = await markVoiceJobQueueFailed(
                jobStore,
                data.jobId,
                data.clinicId,
              );
              logger.error("voice.job.retry_enqueue_failed", {
                jobId: data.jobId,
                stageName,
              });
              return reply.code(503).send({
                error: "voice_queue_unavailable",
                retryable: true,
                data: failedJob,
              });
            }
          }
        }

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof VoiceJobNotFoundError) {
          return reply.code(404).send({ error: "Voice job not found" });
        }

        if (error instanceof VoiceJobRetryError) {
          return reply.code(409).send({ error: error.message });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/v1/voice/jobs/:jobId/recordings",
    preHandler: [authorizeVoiceJobAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(voiceJobParamsSchema, request.params, "deleteParams");
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      const result = await deleteAudioAndTranscript({
        jobId: params.data.jobId,
        clinicId: authenticated.auth.clinicId,
        store: jobStore,
        s3DeleteObject: deleteObject,
      });

      if (!result.success) {
        return reply.code(404).send({ error: result.error });
      }

      return reply.code(204).send();
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/v1/voice/jobs/:jobId/transcript",
    preHandler: [authorizeVoiceJobAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(voiceJobParamsSchema, request.params, "patchTranscriptParams");
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const body = parseOrBadRequest(updateTranscriptBodySchema, request.body ?? {}, "patchTranscriptBody");
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await updateTranscriptText(
          jobStore,
          params.data.jobId,
          authenticated.auth.clinicId,
          body.data.transcriptText,
        );
        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof VoiceJobNotFoundError) {
          return reply.code(404).send({ error: "Voice job not found" });
        }

        throw error;
      }
    },
  });
}
