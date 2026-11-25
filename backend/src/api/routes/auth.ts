import { randomInt, randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";

import type {
  LoginRequest,
  LogoutRequest,
  OtpSendResponse,
  OtpSendRequest,
  OtpVerifyRequest,
  RefreshRequest,
  SignupRequest,
  SignupResponse,
} from "../../../../shared/contracts/auth.js";
import {
  SignupSchema,
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
import { prisma } from "../../data/prismaClient.js";
import type { AuthRepository } from "../../domain/auth/authRepository.js";
import { InMemoryAuthRepository } from "../../domain/auth/inMemoryAuthRepository.js";
import { createEmailOtpProvider } from "../../domain/auth/emailOtpProvider.js";

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

export type OtpStateRecord = {
  id: string;
  userId: string;
  clinicId: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  resends: number;
  lastSentAt: Date;
};

export { InMemoryAuthRepository } from "../../domain/auth/inMemoryAuthRepository.js";

export function createInMemoryAuthRepository(options?: {
  captureOtpCodes?: boolean;
}): InMemoryAuthRepository {
  return new InMemoryAuthRepository(options);
}

export async function hashUserPassword(password: string): Promise<string> {
  const env = parseSecurityEnv();
  return bcrypt.hash(password, env.bcryptCostFactor);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const otpSendSchema = z.object({
  email: z.string().trim().email(),
});

const otpVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
});

const forgotPasswordInitiateSchema = z.object({
  email: z.string().trim().email(),
});

const forgotPasswordResetSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_RESENDS = 3;
const OTP_MAX_INVALID_ATTEMPTS = 5;

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

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

async function saveOtpForUser(
  repository: AuthRepository,
  user: AuthUserRecord,
): Promise<{ code: string; resends: number }> {
  const code = generateOtpCode();
  const existing = await repository.findOtpStateByUserId(user.id);
  const resends = existing ? existing.resends + 1 : 0;
  await repository.saveOtpState({
    id: existing?.id ?? randomUUID(),
    userId: user.id,
    clinicId: user.clinicId,
    email: user.email,
    codeHash: await bcrypt.hash(code, parseSecurityEnv().bcryptCostFactor),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    attempts: 0,
    resends,
    lastSentAt: new Date(),
  });
  repository.setTestOtpCode?.(user.id, code);
  return { code, resends };
}

async function deliverOtpForUser(
  repository: AuthRepository,
  user: AuthUserRecord,
  code: string,
  resends: number,
  purpose?: string,
): Promise<OtpSendResponse> {
  if (repository.getTestOtpCode?.(user.id)) {
    return {
      sent: true,
      remainingResends: Math.max(0, OTP_MAX_RESENDS - resends),
      retryAfterSeconds: 60,
    };
  }

  const delivery = await createEmailOtpProvider().sendOtp({
    email: user.email,
    code,
    ...(purpose ? { purpose } : {}),
  });

  if (!delivery.success) {
    return {
      sent: false,
      error: "otp_delivery_failed",
      remainingResends: Math.max(0, OTP_MAX_RESENDS - resends),
      retryAfterSeconds: 60,
    };
  }

  return {
    sent: true,
    remainingResends: Math.max(0, OTP_MAX_RESENDS - resends),
    retryAfterSeconds: 60,
  };
}

async function sendInitialOtpForUser(
  repository: AuthRepository,
  user: AuthUserRecord,
  purpose?: string,
): Promise<OtpSendResponse> {
  const { code, resends } = await saveOtpForUser(repository, user);
  return deliverOtpForUser(repository, user, code, resends, purpose);
}

async function resendOtpForUser(
  repository: AuthRepository,
  user: AuthUserRecord,
  purpose?: string,
): Promise<OtpSendResponse> {
  const now = new Date();
  const code = generateOtpCode();
  const reservation = await repository.reserveOtpResend({
    id: randomUUID(),
    userId: user.id,
    clinicId: user.clinicId,
    email: user.email,
    codeHash: await bcrypt.hash(code, parseSecurityEnv().bcryptCostFactor),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    now,
    cooldownMs: OTP_RESEND_COOLDOWN_MS,
    maxResends: OTP_MAX_RESENDS,
  });

  if (reservation.status === "cooldown") {
    const retryAfterMs =
      reservation.state.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS - now.getTime();
    return {
      sent: false,
      error: "otp_resend_too_soon",
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      remainingResends: Math.max(0, OTP_MAX_RESENDS - reservation.state.resends),
    };
  }

  if (reservation.status === "limit_reached") {
    return {
      sent: false,
      error: "otp_resend_limit_reached",
      remainingResends: 0,
    };
  }

  repository.setTestOtpCode?.(user.id, code);
  return deliverOtpForUser(repository, user, code, reservation.resends, purpose);
}

async function verifyOtpForUser(
  repository: AuthRepository,
  user: AuthUserRecord,
  email: string,
  code: string,
): Promise<boolean> {
  const state = await repository.findOtpStateByUserId(user.id);
  if (!state || state.expiresAt.getTime() <= Date.now()) {
    return false;
  }

  if (normalizeEmail(state.email) !== normalizeEmail(email)) {
    return recordInvalidOtpAttempt(repository, user);
  }

  const validCode = await bcrypt.compare(code, state.codeHash);
  if (!validCode) {
    return recordInvalidOtpAttempt(repository, user);
  }

  const consumed = await repository.consumeValidOtp({
    id: state.id,
    userId: user.id,
    clinicId: user.clinicId,
    codeHash: state.codeHash,
  });
  if (consumed.status !== "consumed") {
    return false;
  }

  repository.deleteTestOtpCode?.(user.id);
  return true;
}

async function recordInvalidOtpAttempt(
  repository: AuthRepository,
  user: AuthUserRecord,
): Promise<false> {
  const outcome = await repository.consumeInvalidOtpAttempt({
    userId: user.id,
    clinicId: user.clinicId,
    maxAttempts: OTP_MAX_INVALID_ATTEMPTS,
  });
  if (outcome.status === "locked") {
    repository.deleteTestOtpCode?.(user.id);
  }
  return false;
}

function createSignupResponse(user: AuthUserRecord, otpSent: boolean): SignupResponse {
  return {
    user: {
      email: user.email,
      emailVerified: user.emailVerified ?? false,
    },
    otpRequired: true,
    otpSent,
  };
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

  // ── V1: Email/password signup with email OTP ──────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/signup",
    preHandler: [authRateLimits.signupRateLimit],
    async handler(request, reply) {
      const logger = createRequestLogger(request);
      const parsed = SignupSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const payload: SignupRequest = parsed.data;
      const email = normalizeEmail(payload.email);

      if (await repository.findUserByEmail(email)) {
        return reply.code(409).send({ error: "Email already registered" });
      }

      const clinicId = `clinic-${randomUUID()}`;
      const clinic = {
        id: clinicId,
        name: `${payload.firstName} ${payload.lastName}'s Clinic`,
      };

      const user: AuthUserRecord = {
        id: randomUUID(),
        clinicId,
        email,
        name: `${payload.firstName} ${payload.lastName}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        emailVerified: false,
        dataHandlingAcknowledgementVersion: payload.acknowledgementVersion,
        dataHandlingAcknowledgedAt: new Date(),
        passwordHash: await hashUserPassword(payload.password),
        tokenVersion: 0,
      };

      if (repository.createSignupSession) {
        await repository.createSignupSession({ clinic, user });
      } else {
        await prisma.clinic.create({ data: clinic });
        await repository.createUser(user);
      }

      const otpResult = await sendInitialOtpForUser(repository, user, "signup");

      logger.info("auth.signup.succeeded", {
        errorClass: "AuthSignupSuccess",
        userId: user.id,
        clinicId: user.clinicId,
      });

      return reply.code(201).send(createSignupResponse(user, otpResult.sent));
    },
  });

  // ── OTP verification and resend ────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/otp/send",
    preHandler: [authRateLimits.otpSendRateLimit],
    async handler(request, reply) {
      const parsed = otpSendSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const payload: OtpSendRequest = parsed.data;
      const user = await repository.findUserByEmail(
        normalizeEmail(payload.email),
      );
      if (!user) {
        return reply.send({ sent: true });
      }

      const result = await resendOtpForUser(repository, user, "signup");
      return reply.send(result);
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/auth/otp/verify",
    preHandler: [authRateLimits.otpVerifyRateLimit],
    async handler(request, reply) {
      const parsed = otpVerifySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const payload: OtpVerifyRequest = parsed.data;
      const user = await repository.findUserByEmail(
        normalizeEmail(payload.email),
      );
      if (!user || !(await verifyOtpForUser(repository, user, payload.email, payload.code))) {
        return reply.code(401).send({ error: "Invalid verification code" });
      }

      user.emailVerified = true;
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

      return reply.send({
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        tokenType: "Bearer" as const,
        expiresInSeconds: issued.accessTokenExpiresInSeconds,
        claims: issued.claims,
      });
    },
  });

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

      if (!user.emailVerified) {
        return reply.code(403).send({
          error: "email_verification_required",
          email: user.email,
          otpRequired: true,
        });
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

      if (!user.emailVerified) {
        return reply.code(403).send({
          error: "email_verification_required",
          email: user.email,
          otpRequired: true,
        });
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

  // ── Forgot password ────────────────────────────────────────────────────

  app.route({
    method: "POST",
    url: "/api/v1/auth/forgot-password/initiate",
    preHandler: [authRateLimits.forgotPasswordInitiateRateLimit],
    async handler(request, reply) {
      const parsed = forgotPasswordInitiateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const user = await repository.findUserByEmail(
        normalizeEmail(parsed.data.email),
      );
      if (user) {
        const result = await resendOtpForUser(repository, user, "forgot-password");
        return reply.send(result);
      }

      return reply.send({ sent: true });
    },
  });

  app.route({
    method: "POST",
    url: "/api/v1/auth/forgot-password/reset",
    preHandler: [authRateLimits.forgotPasswordResetRateLimit],
    async handler(request, reply) {
      const parsed = forgotPasswordResetSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid auth payload" });
      }

      const user = await repository.findUserByEmail(
        normalizeEmail(parsed.data.email),
      );
      if (
        !user ||
        !(await verifyOtpForUser(repository, user, parsed.data.email, parsed.data.code))
      ) {
        return reply.code(401).send({ error: "Invalid verification code" });
      }

      const now = new Date();
      user.passwordHash = await hashUserPassword(parsed.data.newPassword);
      user.emailVerified = true;
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
