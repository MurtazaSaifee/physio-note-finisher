import Fastify, { type FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryAuthRepository,
  hashToken,
  registerAuthRoutes,
  type InMemoryAuthRepository,
} from "../../src/api/routes/auth.js";
import { registerUserRoutes } from "../../src/api/routes/users.js";
import { issueTokenPair } from "../../src/domain/auth/tokenService.js";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

async function buildUsersTestApp(
  repository: InMemoryAuthRepository,
): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorate("authRepository", repository);
  registerAuthRoutes(app, repository);
  registerUserRoutes(app, repository);
  await app.ready();
  return app;
}

async function signupUser(
  app: FastifyInstance,
  repository: InMemoryAuthRepository,
  payload: {
    email?: string;
    password?: string;
  } = {},
): Promise<void> {
  const email = payload.email ?? "mira.shah@example.com";
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    payload: {
      firstName: "Mira",
      lastName: "Shah",
      email,
      password: payload.password ?? "Passw0rd!",
      acknowledgementVersion: "2026-07-17",
    },
  });

  expect(response.statusCode).toBe(201);
  expect(response.json().otpRequired).toBe(true);
  expect(response.json().otpSent).toBe(true);
}

async function verifySignedUpUser(
  repository: InMemoryAuthRepository,
  email: string,
): Promise<void> {
  const user = await repository.findUserByEmail(email);
  if (!user) {
    throw new Error(`expected signed-up user for ${email}`);
  }
  user.emailVerified = true;
  await repository.saveUser(user);
}

function createAccessToken(repository: InMemoryAuthRepository, email: string): string {
  const user = repository.usersByEmail.get(email);
  if (!user) {
    throw new Error("expected signed-up user");
  }

  return issueTokenPair({
    sub: user.id,
    clinicId: user.clinicId,
    sessionId: "session-1",
    tokenVersion: user.tokenVersion,
  }).accessToken;
}

describe("user routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("GET /api/v1/users/me returns the authenticated user's profile fields", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);
    await signupUser(app, repository);
    await verifySignedUpUser(repository, "mira.shah@example.com");
    const accessToken = createAccessToken(repository, "mira.shah@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: expect.any(String),
        clinicId: expect.any(String),
        firstName: "Mira",
        lastName: "Shah",
        email: "mira.shah@example.com",
        emailVerified: true,
        tokenVersion: 0,
        audioRetentionPeriod: "30d",
      },
    });
  });

  it("GET /api/v1/users/me rejects a pre-existing token when emailVerified is false", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);
    await signupUser(app, repository);
    const accessToken = createAccessToken(repository, "mira.shah@example.com");

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "email_verification_required",
      email: "mira.shah@example.com",
      otpRequired: true,
    });
  });

  it("PUT /api/v1/users/me updates the authenticated user's profile fields", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);
    await signupUser(app, repository);
    await verifySignedUpUser(repository, "mira.shah@example.com");
    const accessToken = createAccessToken(repository, "mira.shah@example.com");

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        firstName: "Meera",
        lastName: "Shah",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: expect.any(String),
        clinicId: expect.any(String),
        firstName: "Meera",
        lastName: "Shah",
        email: "mira.shah@example.com",
        emailVerified: true,
        tokenVersion: 0,
        audioRetentionPeriod: "30d",
      },
    });
    const user = await repository.findUserByEmail("mira.shah@example.com");
    expect(user?.emailVerified).toBe(true);
    expect(user?.tokenVersion).toBe(0);
  });

  it("POST /api/v1/users/me/password-change updates password with current password verification", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);
    await signupUser(app, repository);
    await verifySignedUpUser(repository, "mira.shah@example.com");
    const accessToken = createAccessToken(repository, "mira.shah@example.com");

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/password-change",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      payload: {
        currentPassword: "Passw0rd!",
        newPassword: "NewPassw0rd!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: true });

    const user = repository.usersByEmail.get("mira.shah@example.com");
    expect(user).toBeDefined();
    expect(await bcrypt.compare("NewPassw0rd!", user?.passwordHash ?? "")).toBe(true);
    expect(user?.tokenVersion).toBe(1);
  });

  it("POST /api/v1/users/me/password-change revokes old sessions", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);

    const signupResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: {
        firstName: "Mira",
        lastName: "Shah",
        email: "mira.shah@example.com",
        password: "Passw0rd!",
        acknowledgementVersion: "2026-07-17",
      },
    });

    expect(signupResponse.statusCode).toBe(201);
    await verifySignedUpUser(repository, "mira.shah@example.com");
    const user = repository.usersByEmail.get("mira.shah@example.com");
    expect(user?.tokenVersion).toBe(0);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "mira.shah@example.com",
        password: "Passw0rd!",
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    const oldAccessToken = loginResponse.json().accessToken as string;
    const oldRefreshToken = loginResponse.json().refreshToken as string;

    const resetResponse = await app.inject({
      method: "POST",
      url: "/api/v1/users/me/password-change",
      headers: {
        authorization: `Bearer ${oldAccessToken}`,
      },
      payload: {
        currentPassword: "Passw0rd!",
        newPassword: "NewPassw0rd!",
      },
    });

    expect(resetResponse.statusCode).toBe(200);
    expect(user?.tokenVersion).toBe(1);

    const oldRefreshRecord =
      repository.refreshTokensByHash.get(hashToken(oldRefreshToken));
    expect(oldRefreshRecord?.revokedAt).toBeInstanceOf(Date);

    const staleAccessResponse = await app.inject({
      method: "GET",
      url: "/api/v1/users/me",
      headers: {
        authorization: `Bearer ${oldAccessToken}`,
      },
    });
    expect(staleAccessResponse.statusCode).toBe(401);

    const staleRefreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: oldRefreshToken,
      },
    });
    expect(staleRefreshResponse.statusCode).toBe(401);
  });

  it("requires authentication for user profile updates", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildUsersTestApp(repository);

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/users/me",
      payload: {
        firstName: "Meera",
        lastName: "Shah",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
  });
});
