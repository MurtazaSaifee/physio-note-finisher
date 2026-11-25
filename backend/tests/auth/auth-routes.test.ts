import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAuthTestApp,
  createInMemoryAuthRepository,
  hashToken,
  hashUserPassword,
} from "../../src/api/routes/auth.js";

const originalEnv = { ...process.env };

function parseStructuredEntries(calls: unknown[][]): Array<Record<string, unknown>> {
  return calls.flatMap(([entry]) => {
    if (typeof entry !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(entry) as Record<string, unknown>;
      return [parsed];
    } catch {
      return [];
    }
  });
}

function setAuthEnv(): void {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.BCRYPT_COST_FACTOR = "12";
  process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = "5";
  process.env.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE = "10";
}

describe("auth routes", () => {
  beforeEach(() => {
    setAuthEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("POST /api/v1/auth/login returns access and refresh tokens with user", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 2,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user).toEqual({
      id: "user-1",
      clinicId: "clinic-1",
      name: "Dr Physio",
      email: "clinician@example.com",
      tokenVersion: 2,
    });
  });

  it("POST /api/v1/auth/signup creates an unverified user and returns OTP status only", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/signup",
        payload: {
          firstName: "Mira",
          lastName: "Shah",
          email: "Mira.Shah@example.com",
          password: "Passw0rd!",
          acknowledgementVersion: "2026-07-17",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user).toEqual({
        email: "mira.shah@example.com",
        emailVerified: false,
      });
      expect(body.otpRequired).toBe(true);
      expect(body.otpSent).toBe(true);

      const user = repository.usersByEmail.get("mira.shah@example.com");
      expect(user).toBeDefined();
      expect(user?.email).toBe("mira.shah@example.com");
      expect(user?.emailVerified).toBe(false);
      expect(user).toMatchObject({
        dataHandlingAcknowledgementVersion: "2026-07-17",
        dataHandlingAcknowledgedAt: expect.any(Date),
      });
      expect(repository.getTestOtpCode?.(user?.id ?? "")).toMatch(/^\d{6}$/);

      const entries = parseStructuredEntries(logSpy.mock.calls);
      expect(entries).toContainEqual(
        expect.objectContaining({
          message: "auth.signup.succeeded",
        }),
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("POST /api/v1/auth/otp/send accepts email payloads", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    await app.inject({
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

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/send",
      payload: {
        email: "mira.shah@example.com",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sent: false,
      error: "otp_resend_too_soon",
      remainingResends: 3,
      retryAfterSeconds: 60,
    });
  });

  it("POST /api/v1/auth/otp/verify marks email verified and issues tokens", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    const signup = await app.inject({
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
    expect(signup.statusCode).toBe(201);

    const user = repository.usersByEmail.get("mira.shah@example.com");
    expect(user).toBeDefined();
    const code = repository.getTestOtpCode?.(user!.id);
    expect(code).toMatch(/^\d{6}$/);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: {
        email: "mira.shah@example.com",
        code,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        tokenType: "Bearer",
      }),
    );
    expect(user?.emailVerified).toBe(true);
  });

  it("allows exactly one parallel verification of the same valid OTP", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    await app.inject({
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

    const user = repository.usersByEmail.get("mira.shah@example.com");
    const code = repository.getTestOtpCode?.(user!.id);

    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: "POST",
          url: "/api/v1/auth/otp/verify",
          payload: { email: user!.email, code },
        }),
      ),
    );

    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(1);
    expect(repository.refreshTokensByHash.size).toBe(1);
  });

  it("does not consume a resent OTP when an old verification completes after the resend", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    await app.inject({
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

    const user = repository.usersByEmail.get("mira.shah@example.com");
    const originalState = repository.otpStatesByUserId.get(user!.id)!;
    const oldCode = repository.getTestOtpCode?.(user!.id);
    await repository.saveOtpState({
      ...originalState,
      lastSentAt: new Date(Date.now() - 61_000),
    });

    const originalConsume = repository.consumeValidOtp.bind(repository);
    repository.consumeValidOtp = async (input) => {
      const resend = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/send",
        payload: { email: user!.email },
      });
      expect(resend.statusCode).toBe(200);
      return originalConsume(input);
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: { email: user!.email, code: oldCode },
    });

    expect(response.statusCode).toBe(401);
    expect(user?.emailVerified).toBe(false);
    expect(repository.refreshTokensByHash.size).toBe(0);
    expect(repository.getTestOtpCode?.(user!.id)).toMatch(/^\d{6}$/);
    expect(
      await bcrypt.compare(
        oldCode!,
        repository.otpStatesByUserId.get(user!.id)!.codeHash,
      ),
    ).toBe(false);
  });

  it("POST /api/v1/auth/otp/verify rejects a code when the stored OTP destination no longer matches the email", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    await app.inject({
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

    const user = repository.usersByEmail.get("mira.shah@example.com");
    expect(user).toBeDefined();
    const code = repository.getTestOtpCode?.(user!.id);
    expect(code).toMatch(/^\d{6}$/);

    const otpState = repository.otpStatesByUserId.get(user!.id);
    expect(otpState).toBeDefined();
    otpState!.email = "old-sms-destination@example.com";
    repository.otpStatesByUserId.set(user!.id, otpState!);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/verify",
      payload: {
        email: "mira.shah@example.com",
        code,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Invalid verification code",
    });
    expect(user?.emailVerified).toBe(false);
  });

  it("POST /api/v1/auth/login requires email verification after valid credentials without exposing other accounts", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: false,
      passwordHash,
      tokenVersion: 2,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "email_verification_required",
      email: "clinician@example.com",
      otpRequired: true,
    });
    expect(repository.refreshTokensByHash.size).toBe(0);
  });

  it("invalid password returns generic 401 Invalid credentials", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await bcrypt.hash("CorrectPassword!", 12);

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const badPasswordResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "wrong-password",
      },
    });

    const unknownEmailResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "unknown@example.com",
        password: "wrong-password",
      },
    });

    expect(badPasswordResponse.statusCode).toBe(401);
    expect(badPasswordResponse.json()).toEqual({
      error: "Invalid credentials",
    });
    expect(unknownEmailResponse.statusCode).toBe(401);
    expect(unknownEmailResponse.json()).toEqual({
      error: "Invalid credentials",
    });
  });

  it("invalidates an OTP after five invalid attempts and lets resend create a fresh code", async () => {
    const repository = createInMemoryAuthRepository({ captureOtpCodes: true });
    const app = await buildAuthTestApp(repository);

    const signup = await app.inject({
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
    expect(signup.statusCode).toBe(201);

    const user = repository.usersByEmail.get("mira.shah@example.com");
    expect(user).toBeDefined();
    const originalCode = repository.getTestOtpCode?.(user!.id);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/otp/verify",
        payload: { email: user!.email, code: "000000" },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "Invalid verification code" });
    }

    expect(repository.otpStatesByUserId.get(user!.id)).toBeUndefined();
    expect(repository.getTestOtpCode?.(user!.id)).toBeUndefined();

    const resend = await app.inject({
      method: "POST",
      url: "/api/v1/auth/otp/send",
      payload: { email: user!.email },
    });
    expect(resend.statusCode).toBe(200);
    expect(resend.json()).toMatchObject({ sent: true });
    expect(repository.getTestOtpCode?.(user!.id)).toMatch(/^\d{6}$/);
    expect(repository.getTestOtpCode?.(user!.id)).not.toBe(originalCode);
    expect(repository.otpStatesByUserId.get(user!.id)?.attempts).toBe(0);
  });

  it("refresh token rotates and previous token is marked revokedAt", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 7,
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    const firstRefreshToken = loginResponse.json().refreshToken as string;

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: firstRefreshToken,
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshBody = refreshResponse.json();
    expect(refreshBody.refreshToken).toEqual(expect.any(String));
    expect(refreshBody.refreshToken).not.toBe(firstRefreshToken);
    expect(refreshBody.claims.tokenVersion).toBe(7);

    const previousRecord =
      repository.refreshTokensByHash.get(hashToken(firstRefreshToken));

    expect(previousRecord?.revokedAt).toBeInstanceOf(Date);

    const replayResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: {
        refreshToken: firstRefreshToken,
      },
    });

    expect(replayResponse.statusCode).toBe(401);
  });

  it("allows exactly one parallel rotation of the same refresh token", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 7,
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });
    const refreshToken = loginResponse.json().refreshToken as string;
    const originalConsume = repository.consumeRefreshTokenAndCreateSuccessor.bind(
      repository,
    );
    let consumeCalls = 0;
    let releaseConsume: (() => void) | undefined;
    const bothConsumesEntered = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    repository.consumeRefreshTokenAndCreateSuccessor = async (input) => {
      consumeCalls += 1;
      if (consumeCalls === 2) {
        releaseConsume?.();
      }
      await bothConsumesEntered;
      return originalConsume(input);
    };

    const responsesPromise = Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: "POST",
          url: "/api/v1/auth/refresh",
          payload: { refreshToken },
        }),
      ),
    );
    await bothConsumesEntered;
    expect(consumeCalls).toBe(2);
    releaseConsume?.();
    const responses = await responsesPromise;

    const successfulResponse = responses.find((response) => response.statusCode === 200);
    expect(successfulResponse).toBeDefined();
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 401)).toHaveLength(1);
    expect(responses.find((response) => response.statusCode === 401)?.json()).toEqual({
      error: "Invalid refresh token",
    });
    expect(repository.refreshTokensByHash.size).toBe(2);
    const previousRecord = repository.refreshTokensByHash.get(hashToken(refreshToken));
    const successorRecord = repository.refreshTokensByHash.get(
      hashToken(successfulResponse!.json().refreshToken as string),
    );
    expect(previousRecord?.revokedAt).toBeInstanceOf(
      Date,
    );
    expect(previousRecord?.replacedByTokenHash).toBe(successorRecord?.tokenHash);
    expect(successorRecord).toMatchObject({
      userId: "user-1",
      clinicId: "clinic-1",
      revokedAt: null,
      sessionId: successfulResponse!.json().claims.sessionId,
    });
  });

  it("POST /api/v1/auth/refresh refuses to rotate a token after email verification is revoked", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");
    const user = {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 7,
    };
    repository.usersByEmail.set(user.email, user);
    repository.usersById.set(user.id, user);

    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: user.email, password: "Passw0rd!" },
    });
    const refreshToken = login.json().refreshToken as string;
    user.emailVerified = false;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "email_verification_required",
      email: user.email,
      otpRequired: true,
    });
    expect(repository.refreshTokensByHash.size).toBe(1);
  });

  it("logout revokes active refresh token and bumps token version", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("Passw0rd!");

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      emailVerified: true,
      passwordHash,
      tokenVersion: 1,
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "clinician@example.com",
        password: "Passw0rd!",
      },
    });

    const refreshToken = loginResponse.json().refreshToken as string;
    const tokenHash = hashToken(refreshToken);
    const beforeLogout = repository.refreshTokensByHash.get(tokenHash);
    expect(beforeLogout?.revokedAt).toBeNull();

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      payload: {
        refreshToken,
      },
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ revoked: true });

    const afterLogout = repository.refreshTokensByHash.get(tokenHash);
    expect(afterLogout?.revokedAt).toBeInstanceOf(Date);
    expect(repository.usersByEmail.get("clinician@example.com")?.tokenVersion).toBe(2);
  });

  it("logs login failures with correlation metadata and without credential values", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const passwordHash = await hashUserPassword("CorrectPassword!");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const correlationId = "corr-login-failure";
    const attemptedPassword = "WrongPassword!123";

    repository.usersByEmail.set("clinician@example.com", {
      id: "user-1",
      clinicId: "clinic-1",
      email: "clinician@example.com",
      name: "Dr Physio",
      passwordHash,
      tokenVersion: 1,
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/login",
        headers: {
          "x-correlation-id": correlationId,
        },
        payload: {
          email: "clinician@example.com",
          password: attemptedPassword,
        },
      });

      expect(response.statusCode).toBe(401);

      const entries = parseStructuredEntries(warnSpy.mock.calls);
      const loginFailureEntry = entries.find(
        (entry) => entry.message === "auth.login.failed",
      );

      expect(loginFailureEntry).toBeDefined();
      expect(loginFailureEntry?.requestId).toEqual(expect.any(String));
      expect(loginFailureEntry?.correlationId).toBe(correlationId);
      expect(loginFailureEntry?.errorClass).toBe("InvalidCredentialsError");
      expect(JSON.stringify(entries)).not.toContain(attemptedPassword);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("logs refresh token rejection with correlation metadata and without token values", async () => {
    const repository = createInMemoryAuthRepository();
    const app = await buildAuthTestApp(repository);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const correlationId = "corr-refresh-failure";
    const invalidRefreshToken = "refresh-token-should-not-appear";

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/auth/refresh",
        headers: {
          "x-correlation-id": correlationId,
        },
        payload: {
          refreshToken: invalidRefreshToken,
        },
      });

      expect(response.statusCode).toBe(401);

      const entries = parseStructuredEntries(warnSpy.mock.calls);
      const refreshFailureEntry = entries.find(
        (entry) => entry.message === "auth.refresh.failed",
      );

      expect(refreshFailureEntry).toBeDefined();
      expect(refreshFailureEntry?.requestId).toEqual(expect.any(String));
      expect(refreshFailureEntry?.correlationId).toBe(correlationId);
      expect(refreshFailureEntry?.errorClass).toBe("InvalidRefreshTokenError");
      expect(JSON.stringify(entries)).not.toContain(invalidRefreshToken);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
