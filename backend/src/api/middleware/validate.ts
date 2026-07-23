import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type {
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
} from "../../../../shared/contracts/auth.js";

export type ValidationPreHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<void>;

function createBodyValidationPreHandler<T>(
  schema: z.ZodType<T>,
): ValidationPreHandler {
  return async (request, reply) => {
    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      await reply.code(400).send({ error: "Invalid auth payload" });
      return;
    }

    request.body = parsed.data;
  };
}

const loginRequestSchema: z.ZodType<LoginRequest> = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshRequestSchema: z.ZodType<RefreshRequest> = z.object({
  refreshToken: z.string().min(1),
});

const logoutRequestSchema: z.ZodType<LogoutRequest> = z.object({
  refreshToken: z.string().min(1),
});

export const validateLoginPayload = createBodyValidationPreHandler(
  loginRequestSchema,
);
export const validateRefreshPayload = createBodyValidationPreHandler(
  refreshRequestSchema,
);
export const validateLogoutPayload = createBodyValidationPreHandler(
  logoutRequestSchema,
);
