import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

import type { JwtClaims } from "../../../../shared/contracts/auth.js";
import { parseSecurityEnv } from "../../config/env.js";
import type { AuthRepository } from "../../domain/auth/authRepository.js";

export type AuthenticatedRequest = FastifyRequest & { auth: JwtClaims };

declare module "fastify" {
  interface FastifyInstance {
    authRepository?: AuthRepository;
  }

  interface FastifyRequest {
    auth?: JwtClaims;
  }
}

function extractBearerToken(
  authorizationHeader: string | string[] | undefined,
): string | null {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ", 2);

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function toJwtClaims(payload: jwt.JwtPayload | string): JwtClaims | null {
  if (typeof payload === "string") {
    return null;
  }

  if (
    typeof payload.sub !== "string" ||
    typeof payload.clinicId !== "string" ||
    typeof payload.sessionId !== "string" ||
    typeof payload.tokenVersion !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  return {
    sub: payload.sub,
    clinicId: payload.clinicId,
    sessionId: payload.sessionId,
    tokenVersion: payload.tokenVersion,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = extractBearerToken(request.headers.authorization);

  if (!token) {
    await reply.code(401).send({ error: "Unauthorized" });
    return;
  }

  const securityEnv = parseSecurityEnv();

  try {
    const decoded = jwt.verify(token, securityEnv.jwtAccessSecret);
    const claims = toJwtClaims(decoded);

    if (!claims) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const repository = request.server.authRepository;

    // Route-unit tests register isolated route modules without buildServer.
    // Production, staging, and every buildServer instance always install this
    // dependency, so an undecorated server is never trusted outside tests.
    if (!repository && process.env.NODE_ENV === "test") {
      request.auth = claims;
      return;
    }

    if (!repository) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const user = await repository.findUserById(claims.sub);

    if (
      !user ||
      user.clinicId !== claims.clinicId ||
      user.tokenVersion !== claims.tokenVersion
    ) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    request.auth = claims;
  } catch {
    await reply.code(401).send({ error: "Unauthorized" });
  }
}
