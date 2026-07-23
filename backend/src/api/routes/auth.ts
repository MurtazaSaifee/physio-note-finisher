import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";

import type {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
} from "../../../../shared/contracts/auth.js";
import { parseSecurityEnv } from "../../config/env.js";
import { createLogger } from "../../observability/logger.js";
import { createAuthRateLimitMiddleware } from "../middleware/rateLimit.js";
import {
  validateLoginPayload,
  validateLogoutPayload,
  validateRefreshPayload,
} from "../middleware/validate.js";
import {
  hashToken,
  issueTokenPair,
  verifyRefreshToken,
  type AuthJwtClaims,
} from "../../domain/auth/tokenService.js";
import type { AuthRepository } from "../../domain/auth/authRepository.js";
import { InMemoryAuthRepository } from "../../domain/auth/inMemoryAuthRepository.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

export type AuthUserRecord = {
  id: string;
  clinicId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  dataHandlingAcknowledgementVersion?: string;
  dataHandlingAcknowledgedAt?: Date;
  passwordHash: string;
  tokenVersion: number;
  audioRetentionPeriod?: string;
};

export type RefreshTokenRecord = {
  tokenHash: string;
  userId: string;
  clinicId: string;
  sessionId: string;
  tokenVersion: number;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
};

export { InMemoryAuthRepository } from "../../domain/auth/inMemoryAuthRepository.js";

export function createInMemoryAuthRepository(): InMemoryAuthRepository {
  return new InMemoryAuthRepository();
}

export async function hashUserPassword(password: string): Promise<string> {
  const env = parseSecurityEnv();
  return bcrypt.hash(password, env.bcryptCostFactor);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

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

function createRequestLogger(request: FastifyRequest) {
  const correlationId = readCorrelationId(
    request.headers["x-correlation-id"],
    request.id,
  );

  return createLogger({
    requestId: request.id,
    correlationId,
  });
}

function sendInvalidCredentials(
  reply: FastifyReply,
  logger: ReturnType<typeof createRequestLogger>,
) {
  logger.warn("auth.login.failed", {
    errorClass: "InvalidCredentialsError",
  });

  return reply.code(401).send({ error: "Invalid credentials" });
}

function sendInvalidRefreshToken(
  reply: FastifyReply,
  logger: ReturnType<typeof createRequestLogger>,
) {
  logger.warn("auth.refresh.failed", {
    errorClass: "InvalidRefreshTokenError",
  });

  return reply.code(401).send({ error: "Invalid refresh token" });
}

function createClaimsForUser(user: AuthUserRecord): AuthJwtClaims {
  return {
    sub: user.id,
    clinicId: user.clinicId,
    sessionId: randomUUID(),
    tokenVersion: user.tokenVersion,
  };
}

function createRefreshTokenRecord(
  user: AuthUserRecord,
  refreshToken: string,
  sessionId: string,
  tokenVersion: number,
  refreshTokenExpiresInSeconds: number,
): RefreshTokenRecord {
  const tokenHash = hashToken(refreshToken);
  const now = Date.now();
  return {
    tokenHash,
    userId: user.id,
    clinicId: user.clinicId,
    sessionId,
    tokenVersion,
    expiresAt: new Date(now + refreshTokenExpiresInSeconds * 1000),
    revokedAt: null,
    replacedByTokenHash: null,
  };
}

async function persistRefreshToken(
  repository: AuthRepository,
  user: AuthUserRecord,
  refreshToken: string,
  sessionId: string,
  tokenVersion: number,
  refreshTokenExpiresInSeconds: number,
): Promise<RefreshTokenRecord> {
  const nextRecord = createRefreshTokenRecord(
    user,
    refreshToken,
    sessionId,
    tokenVersion,
    refreshTokenExpiresInSeconds,
  );
  await repository.createRefreshToken(nextRecord);
  return nextRecord;
}

async function revokeAllUserSessions(
  repository: AuthRepository,
  user: AuthUserRecord,
  revokedAt: Date,
): Promise<void> {
  user.tokenVersion += 1;
  await repository.saveUser(user);

  const refreshTokens = await repository.listRefreshTokensByUser(user.id);
  for (const refreshToken of refreshTokens) {
    if (!refreshToken.revokedAt) {
      refreshToken.revokedAt = revokedAt;
      await repository.saveRefreshToken(refreshToken);
    }
  }
}

export function registerAuthRoutes(
  app: FastifyInstance,
  repository: AuthRepository,
): void {
  const authRateLimits = createAuthRateLimitMiddleware(app);

  // ── Login ──────────────────────────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/login",
    preHandler: [authRateLimits.loginRateLimit, validateLoginPayload],
    async handler(request, reply) {
      const logger = createRequestLogger(request);
      const payload = request.body as LoginRequest;

      const email = normalizeEmail(payload.email);
      const user = await repository.findUserByEmail(email);

      if (!user) {
        return sendInvalidCredentials(reply, logger);
      }

      const passwordIsValid = await bcrypt.compare(
        payload.password,
        user.passwordHash,
      );

      if (!passwordIsValid) {
        return sendInvalidCredentials(reply, logger);
      }

      await repository.saveUser(user);
      const claims = createClaimsForUser(user);
      const issued = issueTokenPair(claims);

      await persistRefreshToken(
        repository,
        user,
        issued.refreshToken,
        claims.sessionId,
        claims.tokenVersion,
        issued.refreshTokenExpiresInSeconds,
      );

      logger.info("auth.login.succeeded", {
        errorClass: "AuthLoginSuccess",
        sessionId: claims.sessionId,
        clinicId: user.clinicId,
      });

      return reply.send({
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: issued.accessTokenExpiresInSeconds,
        user: {
          id: user.id,
          clinicId: user.clinicId,
          name: user.name,
          email: user.email,
          tokenVersion: user.tokenVersion,
        },
        claims: issued.claims,
      });
    },
  });

  // ── Refresh ────────────────────────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/refresh",
    preHandler: [authRateLimits.refreshRateLimit, validateRefreshPayload],
    async handler(request, reply) {
      const logger = createRequestLogger(request);
      const payload = request.body as RefreshRequest;

      const decoded = verifyRefreshToken(payload.refreshToken);

      if (!decoded) {
        return sendInvalidRefreshToken(reply, logger);
      }

      const currentTokenHash = hashToken(payload.refreshToken);
      const currentRecord = await repository.findRefreshTokenByHash(currentTokenHash);

      if (!currentRecord) {
        return sendInvalidRefreshToken(reply, logger);
      }

      if (currentRecord.revokedAt) {
        if (currentRecord.replacedByTokenHash) {
          const replayedUser = await repository.findUserById(currentRecord.userId);
          if (replayedUser) {
            await revokeAllUserSessions(repository, replayedUser, new Date());
          }
        }
        return sendInvalidRefreshToken(reply, logger);
      }

      if (currentRecord.expiresAt.getTime() <= Date.now()) {
        return sendInvalidRefreshToken(reply, logger);
      }

      const user = await repository.findUserById(currentRecord.userId);

      if (!user) {
        return sendInvalidRefreshToken(reply, logger);
      }

      if (
        decoded.sub !== user.id ||
        decoded.clinicId !== user.clinicId ||
        decoded.tokenVersion !== user.tokenVersion
      ) {
        return sendInvalidRefreshToken(reply, logger);
      }

      const nextClaims = createClaimsForUser(user);
      const issued = issueTokenPair(nextClaims);
      const nextRecord = createRefreshTokenRecord(
        user,
        issued.refreshToken,
        nextClaims.sessionId,
        nextClaims.tokenVersion,
        issued.refreshTokenExpiresInSeconds,
      );
      const rotated = await repository.consumeRefreshTokenAndCreateSuccessor({
        currentTokenHash,
        nextRecord,
        revokedAt: new Date(),
      });
      if (!rotated) {
        return sendInvalidRefreshToken(reply, logger);
      }

      logger.info("auth.refresh.succeeded", {
        errorClass: "RefreshRotationSuccess",
        sessionId: nextClaims.sessionId,
        clinicId: user.clinicId,
      });

      return reply.send({
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: issued.accessTokenExpiresInSeconds,
        claims: issued.claims,
      });
    },
  });

  // ── Logout ─────────────────────────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/logout",
    preHandler: [validateLogoutPayload],
    async handler(request, reply) {
      const logger = createRequestLogger(request);
      const payload = request.body as LogoutRequest;
      const refreshTokenHash = hashToken(payload.refreshToken);
      const refreshTokenRecord = await repository.findRefreshTokenByHash(
        refreshTokenHash,
      );

      if (!refreshTokenRecord) {
        logger.info("auth.logout.noop", {
          errorClass: "RefreshTokenNotFound",
        });

        return reply.send({ revoked: false });
      }

      if (
        refreshTokenRecord.revokedAt ||
        refreshTokenRecord.expiresAt.getTime() <= Date.now()
      ) {
        logger.info("auth.logout.noop", {
          errorClass: "RefreshTokenInactive",
        });
        return reply.send({ revoked: false });
      }

      const user = await repository.findUserById(refreshTokenRecord.userId);
      if (user) {
        await revokeAllUserSessions(repository, user, new Date());
      }

      logger.info("auth.logout.succeeded", {
        errorClass: "RefreshTokenRevoked",
      });

      return reply.send({ revoked: true });
    },
  });

  // ── Me ─────────────────────────────────────────────────────────────────

  app.route({
    method: "GET",
    url: "/api/v1/auth/me",
    async handler(request, reply) {
      await authenticate(request, reply);
      if (reply.sent) {
        return;
      }

      const authenticated = request as AuthenticatedRequest;
      const user = await repository.findUserById(authenticated.auth.sub);

      if (
        !user ||
        user.clinicId !== authenticated.auth.clinicId ||
        user.tokenVersion !== authenticated.auth.tokenVersion
      ) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      return reply.send({
        user: {
          id: user.id,
          clinicId: user.clinicId,
          name: user.name,
          email: user.email,
          tokenVersion: user.tokenVersion,
        },
      });
    },
  });

  // ── Change Password ────────────────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/change-password",
    async handler(request, reply) {
      await authenticate(request, reply);
      if (reply.sent) {
        return;
      }

      const authenticated = request as AuthenticatedRequest;
      const user = await repository.findUserById(authenticated.auth.sub);

      if (
        !user ||
        user.clinicId !== authenticated.auth.clinicId ||
        user.tokenVersion !== authenticated.auth.tokenVersion
      ) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const { currentPassword, newPassword }: ChangePasswordRequest = parsed.data;
      const passwordIsValid = await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

      if (!passwordIsValid) {
        return reply.code(401).send({ error: "Current password is incorrect" });
      }

      const now = new Date();
      user.passwordHash = await hashUserPassword(newPassword);
      user.tokenVersion += 1;
      await repository.saveUser(user);

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

export async function buildAuthTestApp(
  repository: InMemoryAuthRepository,
): Promise<FastifyInstance> {
  const app = Fastify();
  registerAuthRoutes(app, repository);
  await app.ready();
  return app;
}

export { hashToken };
