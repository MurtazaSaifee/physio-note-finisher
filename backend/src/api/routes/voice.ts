import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  createVoiceUploadSession,
  completeVoiceUploadSession,
  receiveVoiceUploadBinary,
} from "../../domain/voice/voiceUploadService.js";
import {
  defaultStore,
  findVoiceJobByUploadId,
  type VoiceJobStore,
} from "../../domain/voice/voiceJobService.js";
import { getObject } from "../../infrastructure/s3/s3Client.js";
import {
  voiceUploadCompleteParamsSchema,
  voiceUploadCompleteRequestSchema,
  voiceUploadRequestSchema,
} from "../../domain/voice/voiceSchemas.js";
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
import {
  assertPatientAiConsent,
  PatientConsentRequiredError,
  recordPatientAiConsent,
} from "../../domain/voice/voiceConsentService.js";

async function authorizeVoiceAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) {
    return;
  }

  await authorizeClinic(request, reply);
}


const MAX_VOICE_UPLOAD_BYTES = 25 * 1024 * 1024;
const patientConsentRequestSchema = z.object({
  patientId: z.string().trim().min(1),
  consentTextVersion: z.string().trim().min(1),
});


function registerAudioContentTypeParsers(app: FastifyInstance): void {
  const audioTypes = ["audio/m4a", "audio/mp4", "audio/mpeg", "audio/wav", "application/octet-stream"];
  for (const type of audioTypes) {
    app.addContentTypeParser(type, { parseAs: "buffer" }, (_req, body, done) => {
      done(null, body);
    });
  }
}

export function registerVoiceRoutes(
  app: FastifyInstance,
  queue?: StageQueue,
  store?: VoiceJobStore,
): void {
  registerAudioContentTypeParsers(app);

  app.route({
    method: "POST",
    url: "/api/v1/voice/uploads",
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(voiceUploadRequestSchema, request.body, "upload");
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      try {
        await assertPatientAiConsent({
          clinicId: body.data.clinicId,
          patientId: body.data.patientId,
        });
      } catch (error) {
        if (error instanceof PatientConsentRequiredError) {
          return reply.code(403).send({ error: error.errorCode });
        }
        throw error;
      }

      const data = await createVoiceUploadSession(body.data);
      return reply.code(201).send({ success: true, data });
    },
  });

  // Local/dev fallback for environments without S3 presigned uploads.
  app.route({
    method: "PUT",
    url: "/api/v1/voice/uploads/:uploadId/binary",
    // Match the 25 MB ceiling in voiceUploadRequestSchema (Fastify defaults to 1 MiB).
    bodyLimit: MAX_VOICE_UPLOAD_BYTES,
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        voiceUploadCompleteParamsSchema,
        request.params,
        "uploadBinaryParams",
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }
      if (!Buffer.isBuffer(request.body)) {
        return sendInvalidPayload(reply, "Invalid voice payload");
      }

      const contentLengthHeader = request.headers["content-length"];
      const contentLength =
        typeof contentLengthHeader === "string" ? Number(contentLengthHeader) : undefined;
      const result = await receiveVoiceUploadBinary(
        (request as AuthenticatedRequest).auth.clinicId,
        params.data.uploadId,
        request.body,
        Number.isFinite(contentLength) ? contentLength : undefined,
      );
      if (!result.success) {
        return sendInvalidPayload(reply, result.error);
      }
      return reply.send({ success: true });
    },
  });

  // Local/dev playback fallback for Expo Go. S3 deployments use presigned URLs;
  // local mode needs an HTTP URL the physical phone can stream from.
  app.route({
    method: "GET",
    url: "/api/v1/voice/uploads/:uploadId/binary",
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        voiceUploadCompleteParamsSchema,
        request.params,
        "uploadBinaryParams",
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const jobStore = store ?? defaultStore;
      const authenticated = request as AuthenticatedRequest;
      const job = await findVoiceJobByUploadId(jobStore, {
        clinicId: authenticated.auth.clinicId,
        uploadId: params.data.uploadId,
      });
      if (!job?.storageKey) {
        return reply.code(404).send({ error: "Recording not found" });
      }

      const audio = await getObject(job.storageKey);
      return reply
        .header("content-type", "audio/mp4")
        .header("cache-control", "private, max-age=300")
        .send(audio);
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/voice/uploads/:uploadId/complete",
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        voiceUploadCompleteParamsSchema,
        request.params,
        "uploadCompleteParams",
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", params.issues);
      }

      const body = parseOrBadRequest(
        voiceUploadCompleteRequestSchema,
        request.body,
        "uploadCompleteBody",
      );
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }
      if (body.data.uploadId !== params.data.uploadId) {
        return sendInvalidPayload(reply, "Invalid voice payload");
      }

      try {
        await assertPatientAiConsent({
          clinicId: body.data.clinicId,
          patientId: body.data.patientId,
        });
      } catch (error) {
        if (error instanceof PatientConsentRequiredError) {
          return reply.code(403).send({ error: error.errorCode });
        }
        throw error;
      }

      const data = await completeVoiceUploadSession(body.data, queue, store);
      if (!data) {
        return sendInvalidPayload(reply, "Invalid voice payload");
      }
      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/voice/consents",
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(
        patientConsentRequestSchema,
        request.body,
        "consent",
      );
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid consent payload", body.issues);
      }

      const authenticated = request as { auth: { clinicId: string } };
      const clinicId = authenticated.auth.clinicId;

      const data = await recordPatientAiConsent({
        clinicId,
        patientId: body.data.patientId,
        source: "clinician_confirmed_mobile",
        consentTextVersion: body.data.consentTextVersion,
      });

      return reply.code(201).send({ success: true, data });
    },
  });
}
