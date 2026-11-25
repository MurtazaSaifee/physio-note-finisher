import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { 
  createInMemoryAuthRepository, 
  buildAuthTestApp, 
  hashToken,
  hashUserPassword,
  type AuthUserRecord
} from "../src/api/routes/auth.js";
import { randomUUID } from "node:crypto";

const originalEnv = { ...process.env };

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "8";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "100";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "100";
}

describe("Forgot Password Flow", () => {
  let repository: any;
  let app: any;

  beforeEach(async () => {
    setAuthEnv();
    repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    app = await buildAuthTestApp(repository);

    const user: AuthUserRecord = {
      id: randomUUID(),
      clinicId: "clinic-1",
      email: "test@example.com",
      name: "Test User",
      firstName: "Test",
      lastName: "User",
      emailVerified: true,
      passwordHash: await hashUserPassword("OldPassword123!"),
      tokenVersion: 0,
    };
    await repository.createUser(user);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("POST /api/v1/auth/forgot-password/initiate stores a reset OTP without exposing account existence", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sent: true,
      remainingResends: 3,
      retryAfterSeconds: 60,
    });

    const user = repository.usersByEmail.get("test@example.com");
    expect(repository.getTestOtpCode(user.id)).toMatch(/^\d{6}$/);

    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "unknown@example.com" },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toEqual({ sent: true });
  });

  it("limits forgot-password resends to 3 after the initial code and enforces a 60 second cooldown", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });
    expect(first.json()).toEqual({
      sent: true,
      remainingResends: 3,
      retryAfterSeconds: 60,
    });

    const immediateRetry = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });
    expect(immediateRetry.json()).toEqual({
      sent: false,
      error: "otp_resend_too_soon",
      remainingResends: 3,
      retryAfterSeconds: 60,
    });

    const user = repository.usersByEmail.get("test@example.com");
    const state = await repository.findOtpStateByUserId(user.id);
    state.lastSentAt = new Date(Date.now() - 61_000);
    await repository.saveOtpState(state);

    for (const expectedRemaining of [2, 1, 0]) {
      const retry = await app.inject({
        method: "POST",
        url: "/api/v1/auth/forgot-password/initiate",
        payload: { email: "test@example.com" },
      });
      expect(retry.json()).toEqual({
        sent: true,
        remainingResends: expectedRemaining,
        retryAfterSeconds: 60,
      });

      const nextState = await repository.findOtpStateByUserId(user.id);
      nextState.lastSentAt = new Date(Date.now() - 61_000);
      await repository.saveOtpState(nextState);
    }

    const blocked = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });
    expect(blocked.json()).toEqual({
      sent: false,
      error: "otp_resend_limit_reached",
      remainingResends: 0,
    });
  });

  it("POST /api/v1/auth/forgot-password/reset updates password and revokes sessions with a valid OTP", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });
    const user = repository.usersByEmail.get("test@example.com");
    const code = repository.getTestOtpCode(user.id);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "test@example.com",
        password: "OldPassword123!",
      },
    });
    const oldRefreshToken = login.json().refreshToken as string;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/reset",
      payload: {
        email: "test@example.com",
        code,
        newPassword: "NewPassword123!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ updated: true });
    expect(user.emailVerified).toBe(true);
    expect(user.tokenVersion).toBe(1);
    expect(repository.getTestOtpCode(user.id)).toBeUndefined();

    const oldRefresh = await repository.findRefreshTokenByHash(
      hashToken(oldRefreshToken),
    );
    expect(oldRefresh.revokedAt).toBeInstanceOf(Date);

    const newLogin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "test@example.com",
        password: "NewPassword123!",
      },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it("POST /api/v1/auth/forgot-password/reset marks an unverified user as verified", async () => {
    const user = repository.usersByEmail.get("test@example.com");
    user.emailVerified = false;

    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });
    const code = repository.getTestOtpCode(user.id);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/reset",
      payload: {
        email: "test@example.com",
        code,
        newPassword: "NewPassword123!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(user.emailVerified).toBe(true);
  });

  it("POST /api/v1/auth/forgot-password/reset rejects invalid OTP codes", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/initiate",
      payload: { email: "test@example.com" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password/reset",
      payload: {
        email: "test@example.com",
        code: "000000",
        newPassword: "NewPassword123!",
      },
    });

    expect(response.statusCode).toBe(401);
  });
});
