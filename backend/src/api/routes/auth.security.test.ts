import { beforeEach, describe, expect, it } from "vitest";

import {
  buildAuthTestApp,
  createInMemoryAuthRepository,
  hashUserPassword,
} from "./auth.js";

function configureTestEnvironment(): void {
  Object.assign(process.env, {
    APP_ENV: "local",
    NODE_ENV: "test",
    JWT_ACCESS_SECRET: "test-access-secret",
    JWT_REFRESH_SECRET: "test-refresh-secret",
    ACCESS_TOKEN_TTL_SECONDS: "900",
    REFRESH_TOKEN_TTL_SECONDS: "604800",
    BCRYPT_COST_FACTOR: "8",
    AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "100",
    AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "100",
  });
}

async function createFixture() {
  const repository = createInMemoryAuthRepository();
  await repository.createUser({
    id: "user-1",
    clinicId: "clinic-1",
    email: "clinician@example.com",
    name: "Demo Clinician",
    passwordHash: await hashUserPassword("password123"),
    tokenVersion: 0,
    emailVerified: true,
  });
  const app = await buildAuthTestApp(repository);

  async function login() {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "password123",
      },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as {
      accessToken: string;
      refreshToken: string;
    };
  }

  return { app, login };
}

describe("authentication session security", () => {
  beforeEach(configureTestEnvironment);

  it("revokes a rotated successor when its predecessor is replayed", async () => {
    const { app, login } = await createFixture();
    const first = await login();

    const rotation = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    expect(rotation.statusCode).toBe(200);
    const successor = rotation.json() as { refreshToken: string };

    const replay = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: first.refreshToken },
    });
    expect(replay.statusCode).toBe(401);

    const successorAttempt = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: successor.refreshToken },
    });
    expect(successorAttempt.statusCode).toBe(401);

    await app.close();
  });

  it("does not let a stale logged-out token invalidate a later login", async () => {
    const { app, login } = await createFixture();
    const first = await login();

    const firstLogout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: first.refreshToken },
    });
    expect(firstLogout.statusCode).toBe(200);

    const second = await login();
    const staleLogout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: { refreshToken: first.refreshToken },
    });
    expect(staleLogout.statusCode).toBe(200);
    expect(staleLogout.json()).toEqual({ revoked: false });

    const me = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(me.statusCode).toBe(200);

    await app.close();
  });
});
