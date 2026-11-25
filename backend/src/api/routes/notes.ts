import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createLogger } from "../../observability/logger.js";
import { prisma } from "../../data/prismaClient.js";
import * as noteService from "../../domain/notes/noteService.js";
import { listConditionTemplates } from "../../domain/notes/conditionTemplates.js";
import * as templateService from "../../domain/notes/templateService.js";
import {
  createManualNoteSchema,
  conditionTemplateListParamsSchema,
  patientNoteParamsSchema,
  patientSessionNoteParamsSchema,
  saveManualNoteSchema,
  createCustomTemplateSchema,
  updateCustomTemplateSchema,
} from "../../domain/notes/noteSchemas.js";
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
  ConditionTemplateKey,
  CreateManualNoteRequest,
  SaveManualNoteRequest,
} from "../../../../shared/contracts/notes.js";

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

async function authorizeNoteAccess(
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
    logger.warn("protected.notes.access.denied", {
      errorClass: "AuthenticationError",
    });
    return;
  }

  await authorizeClinic(request, reply);

  if (reply.sent) {
    logger.warn("protected.notes.access.denied", {
      errorClass: "ClinicAuthorizationError",
    });
  }
}



function buildCreateManualNoteInput(
  data: z.infer<typeof createManualNoteSchema>,
): CreateManualNoteRequest {
  const input: CreateManualNoteRequest = {
    startedAt: data.startedAt,
    visitType: data.visitType,
    sections: data.sections,
  };

  if (data.templateKey !== undefined) {
    input.templateKey = data.templateKey;
  }
  if (data.templateApplyMode !== undefined) {
    input.templateApplyMode = data.templateApplyMode;
  }

  return input;
}

function buildSaveManualNoteInput(
  data: z.infer<typeof saveManualNoteSchema>,
): SaveManualNoteRequest {
  const input: SaveManualNoteRequest = {
    sections: data.sections,
  };

  if (data.templateKey !== undefined) {
    input.templateKey = data.templateKey;
  }
  if (data.templateApplyMode !== undefined) {
    input.templateApplyMode = data.templateApplyMode;
  }

  return input;
}

function sendNoteError(reply: FastifyReply, error: unknown): FastifyReply | null {
  if (error instanceof noteService.PatientNotFoundError) {
    return reply.code(404).send({ error: "Patient not found" });
  }

  if (error instanceof noteService.SessionNotFoundError) {
    return reply.code(404).send({ error: "Session not found" });
  }

  if (error instanceof noteService.NoteNotFoundError) {
    return reply.code(404).send({ error: "Note not found" });
  }

  if (error instanceof noteService.NoteFinalizedError) {
    return reply.code(409).send({ error: "Note already finalized" });
  }

  return null;
}

async function listRecentTemplateKeys(clinicId: string): Promise<ConditionTemplateKey[]> {
  try {
    const rows = await prisma.progressNote.findMany({
      where: {
        clinicId,
        templateKey: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        templateKey: true,
      },
      take: 25,
    });

    return rows
      .map((row) => row.templateKey)
      .filter((value): value is ConditionTemplateKey => value !== null);
  } catch {
    return [];
  }
}

async function readPatientConditionTags(
  clinicId: string,
  patientId: string | undefined,
): Promise<string[] | undefined> {
  if (!patientId) {
    return undefined;
  }

  try {
    const patient = await prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId,
      },
      select: {
        conditionTags: true,
      },
    });

    if (!patient) {
      return undefined;
    }

    return patient.conditionTags;
  } catch {
    return undefined;
  }
}

export function registerNoteRoutes(app: FastifyInstance): void {
  const templateCategoryBodySchema = z.object({ label: z.string().trim().min(1).max(80) }).strict();

  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/manual-notes",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(patientNoteParamsSchema, request.params);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const body = parseOrBadRequest(createManualNoteSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await noteService.createManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          userId: authenticated.auth.sub,
          input: buildCreateManualNoteInput(body.data),
        });

        return reply.code(201).send({ success: true, data });
      } catch (error) {
        const response = sendNoteError(reply, error);
        if (response) {
          return response;
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/note",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionNoteParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await noteService.getManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        const response = sendNoteError(reply, error);
        if (response) {
          return response;
        }

        throw error;
      }
    },
  });

  app.route({
    method: "PUT",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/note",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionNoteParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const body = parseOrBadRequest(saveManualNoteSchema, request.body);
      if (!body.success) {
        return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await noteService.saveManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
          userId: authenticated.auth.sub,
          input: buildSaveManualNoteInput(body.data),
        });

        return reply.send({ success: true, data });
      } catch (error) {
        const response = sendNoteError(reply, error);
        if (response) {
          return response;
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/note/finalize",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionNoteParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await noteService.finalizeManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
          userId: authenticated.auth.sub,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        const response = sendNoteError(reply, error);
        if (response) {
          return response;
        }

        throw error;
      }
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/patients/:patientId/sessions/:sessionId/note/reopen",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(
        patientSessionNoteParamsSchema,
        request.params,
      );
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;

      try {
        const data = await noteService.reopenManualNote({
          clinicId: authenticated.auth.clinicId,
          patientId: params.data.patientId,
          sessionId: params.data.sessionId,
          userId: authenticated.auth.sub,
        });

        return reply.send({ success: true, data });
      } catch (error) {
        const response = sendNoteError(reply, error);
        if (response) {
          return response;
        }

        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/note-templates",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(conditionTemplateListParamsSchema, request.query);
      if (!params.success) {
        return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      }

      const authenticated = request as AuthenticatedRequest;
      const recentTemplateKeys = await listRecentTemplateKeys(
        authenticated.auth.clinicId,
      );
      const patientConditionTags = await readPatientConditionTags(
        authenticated.auth.clinicId,
        params.data.patientId,
      );
      const templateFilters: Parameters<typeof listConditionTemplates>[0] = {
        recentTemplateKeys,
      };
      if (params.data.category) {
        templateFilters.category = params.data.category;
      }
      if (params.data.query) {
        templateFilters.query = params.data.query;
      }
      if (patientConditionTags && patientConditionTags.length > 0) {
        templateFilters.patientConditionTags = patientConditionTags;
      }
      if (params.data.limit !== undefined) {
        templateFilters.limit = params.data.limit;
      }

      return reply.send({
        success: true,
        data: await listConditionTemplates({
          ...templateFilters,
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
        }),
      });
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/template-categories",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const authenticated = request as AuthenticatedRequest;
      const data = await templateService.listTemplateCategories({
        clinicId: authenticated.auth.clinicId,
        userId: authenticated.auth.sub,
      });
      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/template-categories",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(templateCategoryBodySchema, request.body);
      if (!body.success) return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      const authenticated = request as AuthenticatedRequest;
      const data = await templateService.createTemplateCategory({
        clinicId: authenticated.auth.clinicId,
        userId: authenticated.auth.sub,
        label: body.data.label,
      });
      return reply.code(201).send({ success: true, data });
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/v1/template-categories/:categoryId",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(z.object({ categoryId: z.string().trim().min(1) }).strict(), request.params);
      if (!params.success) return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      const body = parseOrBadRequest(templateCategoryBodySchema, request.body);
      if (!body.success) return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      const authenticated = request as AuthenticatedRequest;
      try {
        const data = await templateService.renameTemplateCategory({
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
          categoryId: params.data.categoryId,
          label: body.data.label,
        });
        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof templateService.TemplateCategoryNotFoundError) {
          return reply.code(404).send({ error: "Template category not found" });
        }
        throw error;
      }
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/v1/template-categories/:categoryId",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(z.object({ categoryId: z.string().trim().min(1) }).strict(), request.params);
      if (!params.success) return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      const authenticated = request as AuthenticatedRequest;
      try {
        await templateService.deleteTemplateCategory({
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
          categoryId: params.data.categoryId,
        });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof templateService.TemplateCategoryNotFoundError) {
          return reply.code(404).send({ error: "Template category not found" });
        }
        throw error;
      }
    },
  });

  app.route({
    method: "GET",
    url: "/api/v1/custom-note-templates",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const query = parseOrBadRequest(
        z.object({
          category: z.string().trim().min(1).max(80).optional(),
          query: z.string().trim().min(1).optional(),
          limit: z.coerce.number().int().positive().max(20).optional(),
        }).strict(),
        request.query,
      );
      if (!query.success) return sendInvalidPayload(reply, "Invalid note payload", query.issues);
      const authenticated = request as AuthenticatedRequest;
      const data = await templateService.listCustomTemplates({
        clinicId: authenticated.auth.clinicId,
        userId: authenticated.auth.sub,
        ...(query.data.category ? { category: query.data.category } : {}),
        ...(query.data.query ? { query: query.data.query } : {}),
        ...(query.data.limit !== undefined ? { limit: query.data.limit } : {}),
      });
      return reply.send({ success: true, data });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/custom-note-templates",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const body = parseOrBadRequest(createCustomTemplateSchema, request.body);
      if (!body.success) return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      const authenticated = request as AuthenticatedRequest;
      const data = await templateService.createCustomTemplate({
        clinicId: authenticated.auth.clinicId,
        userId: authenticated.auth.sub,
        name: body.data.name,
        categories: body.data.categories,
        sections: {
          subjective: body.data.sections.subjective ?? null,
          objective: body.data.sections.objective ?? null,
          assessment: body.data.sections.assessment ?? null,
          plan: body.data.sections.plan ?? null,
        },
      });
      return reply.code(201).send({ success: true, data });
    },
  });

  app.route({
    method: "PATCH",
    url: "/api/v1/custom-note-templates/:templateId",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(z.object({ templateId: z.string().trim().min(1) }).strict(), request.params);
      if (!params.success) return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      const body = parseOrBadRequest(updateCustomTemplateSchema, request.body);
      if (!body.success) return sendInvalidPayload(reply, "Invalid note payload", body.issues);
      const authenticated = request as AuthenticatedRequest;
      try {
        const data = await templateService.updateCustomTemplate({
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
          templateId: params.data.templateId,
          ...(body.data.name !== undefined ? { name: body.data.name } : {}),
          ...(body.data.categories !== undefined
            ? { categories: body.data.categories }
            : {}),
          ...(body.data.sections !== undefined
            ? {
                sections: {
                  subjective: body.data.sections.subjective ?? null,
                  objective: body.data.sections.objective ?? null,
                  assessment: body.data.sections.assessment ?? null,
                  plan: body.data.sections.plan ?? null,
                },
              }
            : {}),
        });
        return reply.send({ success: true, data });
      } catch (error) {
        if (error instanceof templateService.TemplateNotFoundError) {
          return reply.code(404).send({ error: "Template not found" });
        }
        throw error;
      }
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/v1/custom-note-templates/:templateId",
    preHandler: [authorizeNoteAccess],
    async handler(request, reply) {
      const params = parseOrBadRequest(z.object({ templateId: z.string().trim().min(1) }).strict(), request.params);
      if (!params.success) return sendInvalidPayload(reply, "Invalid note payload", params.issues);
      const authenticated = request as AuthenticatedRequest;
      try {
        await templateService.deleteCustomTemplate({
          clinicId: authenticated.auth.clinicId,
          userId: authenticated.auth.sub,
          templateId: params.data.templateId,
        });
        return reply.code(204).send();
      } catch (error) {
        if (error instanceof templateService.TemplateNotFoundError) {
          return reply.code(404).send({ error: "Template not found" });
        }
        throw error;
      }
    },
  });
}
