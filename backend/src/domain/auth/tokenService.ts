import { createHash } from "node:crypto";

import jwt from "jsonwebtoken";

import { parseSecurityEnv } from "../../config/env.js";

export type AuthJwtClaims = {
  sub: string;
  clinicId: string;
  sessionId: string;
  tokenVersion: number;
};

export type AuthJwtClaimsWithMeta = AuthJwtClaims & {
  iat: number;
  exp: number;
};

type TokenEnvironment = {
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  ACCESS_TOKEN_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_SECONDS: number;
};

export type IssuedTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  refreshTokenExpiresInSeconds: number;
  claims: AuthJwtClaims;
};

function getTokenEnvironment(): TokenEnvironment {
  const runtime = parseSecurityEnv();

  return {
    JWT_ACCESS_SECRET: runtime.jwtAccessSecret,
    JWT_REFRESH_SECRET: runtime.jwtRefreshSecret,
    ACCESS_TOKEN_TTL_SECONDS: runtime.accessTokenTtlSeconds,
    REFRESH_TOKEN_TTL_SECONDS: runtime.refreshTokenTtlSeconds,
  };
}

export function issueTokenPair(claims: AuthJwtClaims): IssuedTokenPair {
  const env = getTokenEnvironment();

  const accessToken = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });

  const refreshToken = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    algorithm: "HS256",
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  });

  const decoded = jwt.decode(accessToken) as AuthJwtClaimsWithMeta;

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresInSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresInSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    claims: decoded,
  };
}

export function verifyRefreshToken(
  refreshToken: string,
): AuthJwtClaimsWithMeta | null {
  const env = getTokenEnvironment();

  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;

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
  } catch {
    return null;
  }
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
