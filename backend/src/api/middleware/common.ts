import type { FastifyReply } from "fastify";
import { z } from "zod";
import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "validationMiddleware" });

export function parseOrBadRequest<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label?: string,
): { success: true; data: T } | { success: false; issues: z.ZodIssue[] } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    if (label) {
      logger.warn("validation.failed", { label, issues: parsed.error.issues });
    }
    return { success: false, issues: parsed.error.issues };
  }
  return { success: true, data: parsed.data };
}

export function sendInvalidPayload(
  reply: FastifyReply,
  message = "Invalid request payload",
  issues?: z.ZodIssue[],
): FastifyReply {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const payload: Record<string, unknown> = { error: message };
  if (nodeEnv !== "production" && nodeEnv !== "test" && issues && issues.length > 0) {
    payload.details = issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  }
  return reply.code(400).send(payload);
}
