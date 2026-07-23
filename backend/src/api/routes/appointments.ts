import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import {
  appointmentHistoryQuerySchema,
  appointmentParamsSchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
} from "../../domain/appointments/appointmentSchemas.js";
import {
  cancelAppointment,
  createAppointment,
  getAppointmentDetail,
  getAppointmentHistory,
  listActiveAppointments,
  startSessionFromAppointment,
  updateAppointment,
} from "../../domain/appointments/appointmentService.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { authorizeClinic } from "../middleware/authorizeClinic.js";
import {
  parseOrBadRequest,
  sendInvalidPayload,
} from "../middleware/common.js";
import { startSessionFromAppointmentSchema } from "../../domain/appointments/appointmentSchemas.js";

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

async function authorizeAppointmentAccess(
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
    logger.warn("protected.appointments.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.appointments.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}

export function registerAppointmentRoutes(app: FastifyInstance): void {
  app.route({
    method: "GET",
    url: "/api/v1/appointments",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const query = parseOrBadRequest(listAppointmentsQuerySchema, request.query);
      if (!query.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", query.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const listInput: { clinicId: string; date?: string; timezoneOffset?: string } = {
        clinicId: authenticated.auth.clinicId,
      };
      if (query.data.date !== undefined) {
        listInput.date = query.data.date;
      }
      if (query.data.timezoneOffset !== undefined) {
        listInput.timezoneOffset = query.data.timezoneOffset;
      }
      const data = await listActiveAppointments(listInput);

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/appointments",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(createAppointmentSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await createAppointment({
          clinicId: authenticated.auth.clinicId,
          input: body.data,
        });

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/appointments/:appointmentId",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(appointmentParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await getAppointmentDetail({
          clinicId: authenticated.auth.clinicId,
          appointmentId: params.data.appointmentId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "AppointmentNotFoundError") {
          return reply.code(404).send({ error: "Appointment not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "PUT",
    url: "/api/v1/appointments/:appointmentId",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(appointmentParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", params.issues);
      }

      const body = parseOrBadRequest(updateAppointmentSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await updateAppointment({
          clinicId: authenticated.auth.clinicId,
          appointmentId: params.data.appointmentId,
          input: body.data,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        if (error instanceof Error && error.name === "AppointmentNotFoundError") {
          return reply.code(404).send({ error: "Appointment not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/appointments/:appointmentId/cancel",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(appointmentParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await cancelAppointment({
          clinicId: authenticated.auth.clinicId,
          appointmentId: params.data.appointmentId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "AppointmentNotFoundError") {
          return reply.code(404).send({ error: "Appointment not found" });
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/appointments/history",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const query = parseOrBadRequest(appointmentHistoryQuerySchema, request.query);
      if (!query.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", query.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const historyInput: { clinicId: string; limit?: number } = {
        clinicId: authenticated.auth.clinicId,
      };
      if (query.data.limit !== undefined) {
        historyInput.limit = query.data.limit;
      }
      const data = await getAppointmentHistory(historyInput);

      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/appointments/:appointmentId/start-session",
    preHandler: [authorizeAppointmentAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(appointmentParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", params.issues);
      }

      const body = parseOrBadRequest(startSessionFromAppointmentSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid appointment payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await startSessionFromAppointment({
          clinicId: authenticated.auth.clinicId,
          appointmentId: params.data.appointmentId,
          input: body.data,
        });

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        if (error instanceof Error && error.name === "AppointmentNotFoundError") {
          return reply.code(404).send({ error: "Appointment not found" });
        }

        if (error instanceof Error && error.name === "AppointmentUnavailableError") {
          return reply.code(409).send({ error: "Appointment is not available for session start" });
        }

        if (error instanceof Error && error.name === "PatientNotFoundError") {
          return reply.code(404).send({ error: "Patient not found" });
        }

        throw error;
      }
    },
  });
}
