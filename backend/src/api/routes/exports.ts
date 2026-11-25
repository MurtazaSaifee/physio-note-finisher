import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { CreateExportRecordRequest } from "../../../../shared/contracts/exports.js";
import { createLogger } from "../../observability/logger.js";
import { createAuditEvent } from "../../domain/audit/auditService.js";
import {
  createExportRecord,
  enqueueExportGeneration,
  type ExportQueue,
  getExportRecord,
  getExportRecordFile,
  InvalidExportRecordError,
  listPatientExportRecords,
} from "../../domain/exports/exportRecordService.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import { createPresignedDownloadUrl } from "../../infrastructure/s3/s3Client.js";
import { prisma } from "../../data/prismaClient.js";

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

async function authorizeExportAccess(
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
    logger.warn("protected.exports.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);
  if (reply.sent) {
    logger.warn("protected.exports.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

const patientParamsSchema = z.object({
  patientId: z.string().min(1),
});

const exportRecordParamsSchema = patientParamsSchema.extend({
  sessionId: z.string().min(1),
});

const createExportRecordSchema = z.object({
  action: z.enum(["saved", "shared", "copied"]),
  type: z.enum(["fullNote", "patientSummary"]),
  format: z.enum(["pdf", "text"]),
});

export function registerExportRoutes(
  app: FastifyInstance,
  exportQueue?: ExportQueue,
): void {
  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/export-records",
    preHandler: [authorizeExportAccess],
    async handler(request, reply) {
      const correlationId = readCorrelationId(
        request.headers["x-correlation-id"],
        request.id,
      );
      const logger = createLogger({
        requestId: request.id,
        correlationId,
      });

      const params = parseOrBadRequest(exportRecordParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid export payload", params.issues);
      }

      const body = parseOrBadRequest(createExportRecordSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid export payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await createExportRecord({
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
          input: body.data satisfies CreateExportRecordRequest,
        });

        await createAuditEvent({
          eventType: "noteExported",
          sessionId: params.data.sessionId,
          userId: authenticated.auth.sub,
          clinicId: authenticated.auth.clinicId,
          metadata: {
            exportAction: body.data.action,
            exportType: body.data.type,
            format: body.data.format,
          },
	        });

        if (body.data.format === "pdf" && exportQueue) {
          void enqueueExportGeneration(
            exportQueue,
            data.id,
            authenticated.auth.clinicId,
            params.data.sessionId,
          ).catch(async (error) => {
            const message = error instanceof Error ? error.message : String(error);
            await prisma.exportRecord.update({
              where: { id: data.id },
              data: {
                fileStatus: "failed",
                fileError: message,
              },
            }).catch((updateError) => {
              logger.error("protected.exports.enqueue.failure_status_update_failed", {
                exportId: data.id,
                errorClass: updateError instanceof Error ? updateError.name : "UnknownError",
                message: updateError instanceof Error ? updateError.message : String(updateError),
              });
            });
            logger.error("protected.exports.enqueue.failed", {
              exportId: data.id,
              errorClass: error instanceof Error ? error.name : "UnknownError",
              message,
            });
          });
        }

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        if (error instanceof InvalidExportRecordError) {
          return reply.code(400).send({ error: "Invalid export record" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId/export-records",
    preHandler: [authorizeExportAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(patientParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid export payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const data = await listPatientExportRecords({
        clinicId: authenticated.auth.clinicId,
        patientId: params.data.patientId,
      });

      return reply.send({ success: true, data });
    },
  });

  // Status route — get a single export record
  const exportStatusParamsSchema = exportRecordParamsSchema.extend({
    exportId: z.string().min(1),
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/exports/:exportId",
    preHandler: [authorizeExportAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        exportStatusParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid export params", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      const record = await getExportRecord(
        params.data.exportId,
        authenticated.auth.clinicId,
        params.data.patientId,
        params.data.sessionId,
      );

      if (!record) {
        return reply.code(404).send({ error: "Export record not found" });
      }

      return reply.send({ success: true, data: record });
    },
  });

  // Download route — generate a 15-minute (900s) presigned download URL
  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/exports/:exportId/download",
    preHandler: [authorizeExportAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        exportStatusParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(
          reply,
          "Invalid download params",
          params.issues,
        );
      }

      const authenticated = request as AuthenticatedRequest;

      // Verify session is finalized
      const session = await prisma.session.findFirst({
        where: {
          id: params.data.sessionId,
          clinicId: authenticated.auth.clinicId,
        },
        select: { id: true, patientId: true, noteStatus: true },
      });

      if (
        !session ||
        session.patientId !== params.data.patientId ||
        session.noteStatus !== "finalized"
      ) {
        return reply
          .code(400)
          .send({ error: "Export not available for this session" });
      }

      // Fetch the server-only export file metadata.
      const record = await getExportRecordFile({
        exportId: params.data.exportId,
        clinicId: authenticated.auth.clinicId,
        patientId: params.data.patientId,
        sessionId: params.data.sessionId,
      });

      if (!record) {
        return reply.code(404).send({ error: "Export record not found" });
      }

      if (record.fileStatus !== "succeeded" || !record.fileStorageKey) {
        return reply
          .code(400)
          .send({ error: "Export file not ready for download" });
      }

      const downloadUrl = await createPresignedDownloadUrl(
        record.fileStorageKey,
        900,
      );
      const expiresAt = new Date(
        Date.now() + 900 * 1000,
      ).toISOString();

      return reply.send({
        success: true,
        data: { downloadUrl, expiresAt },
      });
    },
  });
}
