import bcrypt from "bcryptjs";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  ProfileUpdateSchema,
  type ProfileUpdateRequest,
} from "../../../../shared/contracts/auth.js";
import {
  UpdateRetentionPolicyRequestSchema,
  type UpdateRetentionPolicyRequest,
} from "../../../../shared/contracts/users.js";
import {
  hashUserPassword,
  type AuthUserRecord,
} from "./auth.js";
import type { AuthRepository } from "../../domain/auth/authRepository.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

function sendInvalidPayload(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({ error: "Invalid user payload" });
}

function toUserResponse(user: AuthUserRecord) {
  return {
    id: user.id,
    clinicId: user.clinicId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    emailVerified: user.emailVerified ?? false,
    tokenVersion: user.tokenVersion,
    audioRetentionPeriod: user.audioRetentionPeriod ?? "30d",
  };
}

async function requireAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
  repository: AuthRepository,
): Promise<AuthUserRecord | null> {
  await authenticate(request, reply);

  if (reply.sent) {
    return null;
  }

  const authenticated = request as AuthenticatedRequest;
  const user = await repository.findUserById(authenticated.auth.sub);

  if (
    !user ||
    user.clinicId !== authenticated.auth.clinicId ||
    user.tokenVersion !== authenticated.auth.tokenVersion
  ) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }

  return user;
}

export function registerUserRoutes(
  app: FastifyInstance,
  repository: AuthRepository,
): void {
  app.route({
    method: "GET",
    url: "/api/v1/users/me",
    async handler(request, reply) {
      const user = await requireAuthenticatedUser(request, reply, repository);

      if (!user) {
        return;
      }

      return reply.send({ user: toUserResponse(user) });
    },
  });

  app.route({
    method: "PUT",
    url: "/api/v1/users/me",
    async handler(request, reply) {
      const user = await requireAuthenticatedUser(request, reply, repository);

      if (!user) {
        return;
      }

      const parsed = ProfileUpdateSchema.safeParse(request.body);

      if (!parsed.success) {
        return sendInvalidPayload(reply);
      }

      const payload: ProfileUpdateRequest = parsed.data;
      user.firstName = payload.firstName;
      user.lastName = payload.lastName;
      user.name = `${payload.firstName} ${payload.lastName}`;

      await repository.saveUser(user);

      return reply.send({ user: toUserResponse(user) });
    },
  });

  app.route({
    method: "PUT",
    url: "/api/v1/users/me/retention",
    async handler(request, reply) {
      const user = await requireAuthenticatedUser(request, reply, repository);

      if (!user) {
        return;
      }

      const parsed = UpdateRetentionPolicyRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return sendInvalidPayload(reply);
      }

      const payload: UpdateRetentionPolicyRequest = parsed.data;
      user.audioRetentionPeriod = payload.audioRetentionPeriod;
      await repository.saveUser(user);

      return reply.send({ user: toUserResponse(user) });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/users/me/password-change",
    async handler(request, reply) {
      const user = await requireAuthenticatedUser(request, reply, repository);

      if (!user) {
        return;
      }

      const parsed = passwordChangeSchema.safeParse(request.body);

      if (!parsed.success) {
        return sendInvalidPayload(reply);
      }

      const { currentPassword, newPassword } = parsed.data;
      const passwordIsValid = await bcrypt.compare(currentPassword, user.passwordHash);

      if (!passwordIsValid) {
        return reply.code(401).send({ error: "Current password is incorrect" });
      }

      const now = new Date();
      user.passwordHash = await hashUserPassword(newPassword);
      user.tokenVersion += 1;
      await repository.saveUser(user);

      // Revoke all existing sessions after password change
      const refreshTokens = await repository.listRefreshTokensByUser(user.id);
      for (const refreshToken of refreshTokens) {
        if (!refreshToken.revokedAt) {
          refreshToken.revokedAt = now;
          await repository.saveRefreshToken(refreshToken);
        }
      }

      return reply.send({ updated: true });
    },
  });
}
