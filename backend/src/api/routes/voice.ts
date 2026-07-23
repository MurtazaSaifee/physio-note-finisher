import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  createVoiceUploadSession,
  completeVoiceUploadSession,
  receiveVoiceUploadBinary,
} from "../../domain/voice/voiceUploadService.js";
import {
  defaultStore,
  enqueueTranscriptionJob,
  findVoiceJobByUploadId,
  type VoiceJobStore,
} from "../../domain/voice/voiceJobService.js";
import { getObject } from "../../infrastructure/storage/localStorageProvider.js";
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

const patientConsentRequestSchema = z.object({
  patientId: z.string().trim().min(1),
  consentTextVersion: z.string().trim().min(1),
});

function isSarvamConfigured(): boolean {
  return Boolean(process.env.SARVAM_API_KEY?.trim());
}

function sendSarvamNotConfigured(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    code: "sarvam_not_configured",
    message: "Configure SARVAM_API_KEY to use AI features.",
  });
}

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

  // ── AI Endpoint: POST /api/v1/voice/process ──
  app.route({
    method: "POST",
    url: "/api/v1/voice/process",
    preHandler: [authorizeVoiceAccess],
    async handler(request, reply) {
      if (!isSarvamConfigured()) {
        return sendSarvamNotConfigured(reply);
      }

      const body = parseOrBadRequest(voiceUploadRequestSchema, request.body, "process");
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid voice payload", body.issues);
      }

      const jobStore = store ?? defaultStore;
      const authenticated = request as AuthenticatedRequest;

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

      const session = await createVoiceUploadSession(body.data);
      const job = await enqueueTranscriptionJob(jobStore, {
        clinicId: authenticated.auth.clinicId,
        patientId: body.data.patientId,
        uploadId: session.uploadId,
        storageKey: session.storageKey,
      });

      if (queue) {
        await queue.add(
          "transcription",
          { jobId: job.jobId, clinicId: authenticated.auth.clinicId, uploadId: session.uploadId },
          { jobId: `${job.jobId}-transcription` },
        );
      }

      return reply.code(200).send({ success: true, data: { jobId: job.jobId, uploadId: session.uploadId, status: job.status } });
    },
  });

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

  app.route({
    method: "PUT",
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

      if (!isSarvamConfigured()) {
        return sendSarvamNotConfigured(reply);
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
