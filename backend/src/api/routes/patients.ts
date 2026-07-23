import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import * as patientService from "../../domain/patients/patientService.js";
import {
  archivePatientSchema,
  createPatientSchema,
  listPatientsQuerySchema,
  patientPathParamsSchema,
  updatePatientSchema,
} from "../../domain/patients/patientSchemas.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import type {
  CreatePatientRequest,
  UpdatePatientRequest,
} from "../../../../shared/contracts/patients.js";

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

async function authorizePatientAccess(
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
    logger.warn("protected.patients.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.patients.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}



function buildCreatePatientInput(
  data: z.infer<typeof createPatientSchema>,
): CreatePatientRequest {
  const input: CreatePatientRequest = {
    fullName: data.fullName,
  };

  if (data.dateOfBirth !== undefined) {
    input.dateOfBirth = data.dateOfBirth;
  }

  if (data.sex !== undefined) {
    input.sex = data.sex;
  }

  if (data.phone !== undefined) {
    input.phone = data.phone;
  }

  if (data.email !== undefined) {
    input.email = data.email;
  }

  if (data.addressLine !== undefined) {
    input.addressLine = data.addressLine;
  }

  if (data.clinicalNotes !== undefined) {
    input.clinicalNotes = data.clinicalNotes;
  }

  if (data.conditionTags !== undefined) {
    input.conditionTags = data.conditionTags;
  }

  return input;
}

function buildUpdatePatientInput(
  data: z.infer<typeof updatePatientSchema>,
): UpdatePatientRequest {
  const input: UpdatePatientRequest = {};

  if (data.fullName !== undefined) {
    input.fullName = data.fullName;
  }

  if (data.dateOfBirth !== undefined) {
    input.dateOfBirth = data.dateOfBirth;
  }

  if (data.sex !== undefined) {
    input.sex = data.sex;
  }

  if (data.phone !== undefined) {
    input.phone = data.phone;
  }

  if (data.email !== undefined) {
    input.email = data.email;
  }

  if (data.addressLine !== undefined) {
    input.addressLine = data.addressLine;
  }

  if (data.clinicalNotes !== undefined) {
    input.clinicalNotes = data.clinicalNotes;
  }

  if (data.conditionTags !== undefined) {
    input.conditionTags = data.conditionTags;
  }

  return input;
}

export function registerPatientRoutes(app: FastifyInstance): void {
  app.route({
    method: "POST",
    url: "/api/v1/patients",
    preHandler: [authorizePatientAccess],
    async handler(request, reply) {
      const parsed = parseOrBadRequest(createPatientSchema, request.body);

      if (!parsed.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", parsed.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const data = await patientService.createPatient({
        clinicId: authenticated.auth.clinicId,
        input: buildCreatePatientInput(parsed.data),
      });

      return reply.code(201).send({ success: true, data });
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients",
    preHandler: [authorizePatientAccess],
    async handler(request, reply) {
      const parsed = parseOrBadRequest(listPatientsQuerySchema, request.query);

      if (!parsed.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", parsed.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const listInput = {
        clinicId: authenticated.auth.clinicId,
        ...(parsed.data.query !== undefined ? { query: parsed.data.query } : {}),
        includeArchived: Boolean(parsed.data.includeArchived),
        ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
        ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
      };
      const data = await patientService.listPatients({
        ...listInput,
      });

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId",
    preHandler: [authorizePatientAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientPathParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await patientService.getPatientProfile({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof patientService.PatientNotFoundError) {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/v1/patients/:patientId",
    preHandler: [authorizePatientAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientPathParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", params.issues);
      }

      const body = parseOrBadRequest(updatePatientSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await patientService.updatePatient({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          input: buildUpdatePatientInput(body.data),
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof patientService.PatientNotFoundError) {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/archive",
    preHandler: [authorizePatientAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientPathParamsSchema,
        request.params,
      );

      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", params.issues);
      }

      const body = parseOrBadRequest(archivePatientSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid patient payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await patientService.setPatientArchived({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          archived: body.data.archived,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof patientService.PatientNotFoundError) {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });
}
