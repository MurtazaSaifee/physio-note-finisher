import { describe, expect, it } from "vitest";

import { parseAppEnv, parseSecurityEnv } from "../../src/config/env.js";
import { loadManagedSecrets } from "../../src/config/secrets.js";
import { redactSensitiveFields } from "../../src/observability/logger.js";

const validEnv: NodeJS.ProcessEnv = {
  JWT_ACCESS_SECRET: "access-secret-value",
  JWT_REFRESH_SECRET: "refresh-secret-value",
  ACCESS_TOKEN_TTL_SECONDS: "900",
  REFRESH_TOKEN_TTL_SECONDS: "604800",
  BCRYPT_COST_FACTOR: "12",
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "5",
  AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10",
};

describe("env validation", () => {
  it("parses the runtime app environment tier", () => {
    expect(parseAppEnv({ APP_ENV: "local" })).toBe("local");
    expect(parseAppEnv({ APP_ENV: "staging" })).toBe("staging");
    expect(parseAppEnv({ APP_ENV: "production" })).toBe("production");
    expect(() => parseAppEnv({ APP_ENV: "demo" })).toThrow(/APP_ENV/);
  });

  it("fails when required vars are missing", () => {
    expect(() =>
      parseSecurityEnv({
        ...validEnv,
        JWT_ACCESS_SECRET: undefined,
        JWT_REFRESH_SECRET: undefined,
      }),
    ).toThrow(/JWT_ACCESS_SECRET|JWT_REFRESH_SECRET/);
  });

  it("fails when numeric vars are invalid", () => {
    expect(() =>
      parseSecurityEnv({
        ...validEnv,
        ACCESS_TOKEN_TTL_SECONDS: "-1",
        AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "0",
        BCRYPT_COST_FACTOR: "abc",
      }),
    ).toThrow(
      /ACCESS_TOKEN_TTL_SECONDS|AUTH_LOGIN_RATE_LIMIT_PER_MINUTE|BCRYPT_COST_FACTOR/,
    );
  });

  it("returns typed config for valid inputs", () => {
    const result = parseSecurityEnv(validEnv);

    expect(result).toEqual({
      jwtAccessSecret: "access-secret-value",
      jwtRefreshSecret: "refresh-secret-value",
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 604800,
      bcryptCostFactor: 12,
      authLoginRateLimitPerMinute: 5,
      authRefreshRateLimitPerMinute: 10,
    });
  });

  it("requires strong and distinct JWT secrets outside local runtime", () => {
    expect(() =>
      parseSecurityEnv({
        ...validEnv,
        APP_ENV: "staging",
        NODE_ENV: "staging",
        JWT_ACCESS_SECRET: "short",
        JWT_REFRESH_SECRET: "short",
      }),
    ).toThrow(/JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|differ/);

    const strongAccessSecret = "a".repeat(32);
    const strongRefreshSecret = "b".repeat(32);
    expect(
      parseSecurityEnv({
        ...validEnv,
        APP_ENV: "production",
        NODE_ENV: "production",
        JWT_ACCESS_SECRET: strongAccessSecret,
        JWT_REFRESH_SECRET: strongRefreshSecret,
      }),
    ).toEqual(
      expect.objectContaining({
        jwtAccessSecret: strongAccessSecret,
        jwtRefreshSecret: strongRefreshSecret,
      }),
    );
  });

  it("rejects non-local APP_ENV when NODE_ENV would select local volatile runtime", async () => {
    const { buildServer } = await import("../../src/server.js");
    const previousAppEnv = process.env.APP_ENV;
    const previousNodeEnv = process.env.NODE_ENV;

    try {
      process.env.APP_ENV = "staging";
      process.env.NODE_ENV = "development";

      await expect(buildServer()).rejects.toThrow(/NODE_ENV.*staging|production/i);
    } finally {
      if (previousAppEnv === undefined) {
        delete process.env.APP_ENV;
      } else {
        process.env.APP_ENV = previousAppEnv;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});

describe("managed secret policy", () => {
  it("skips managed secret loading for local runtime", async () => {
    const result = await loadManagedSecrets({ appEnv: "local" });

    expect(result).toEqual({});
  });

  it("requires every managed secret in staging and production", async () => {
    await expect(
      loadManagedSecrets({
        appEnv: "production",
        parameterPath: "/physio/production/",
        ssmClient: {
          send: async () => ({
            Parameters: [
              {
                Name: "/physio/production/DATABASE_URL",
                Value: "postgresql://example",
              },
            ],
          }),
        },
      }),
    ).rejects.toThrow("Missing managed secret: JWT_ACCESS_SECRET");
  });

  it("returns managed secrets without exposing their values in missing-key errors", async () => {
    const secretValues = {
      DATABASE_URL: "postgresql://secret-db",
      JWT_ACCESS_SECRET: "access-secret",
      JWT_REFRESH_SECRET: "refresh-secret",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      BCRYPT_COST_FACTOR: "12",
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "5",
      AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10",
      SARVAM_API_KEY: "sarvam-secret",
      GOOGLE_CALENDAR_CLIENT_ID: "calendar-client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "calendar-client-secret",
      GOOGLE_CALENDAR_REDIRECT_URI: "https://api.test.com/auth/google/callback",
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: "calendar-token-key",
      S3_REGION: "ap-south-1",
      S3_BUCKET: "private-bucket",
      SQS_VOICE_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/voice",
      SQS_CALENDAR_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/calendar",
      SQS_REMINDER_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/reminder",
      SQS_EXPORT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/export",
    };

    const result = await loadManagedSecrets({
      appEnv: "staging",
      parameterPath: "/physio/staging/",
      ssmClient: {
        send: async () => ({
          Parameters: Object.entries(secretValues).map(([key, value]) => ({
            Name: `/physio/staging/${key}`,
            Value: value,
          })),
        }),
      },
    });

    expect(result).toEqual(secretValues);
  });

  it("loads managed secrets in batches of at most ten names", async () => {
    const parameterPath = "/physio/staging/";
    const sentNames: string[][] = [];
    const secretValues = {
      DATABASE_URL: "postgresql://secret-db",
      JWT_ACCESS_SECRET: "access-secret",
      JWT_REFRESH_SECRET: "refresh-secret",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      BCRYPT_COST_FACTOR: "12",
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "5",
      AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10",
      SARVAM_API_KEY: "sarvam-secret",
      GOOGLE_CALENDAR_CLIENT_ID: "calendar-client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "calendar-client-secret",
      GOOGLE_CALENDAR_REDIRECT_URI: "https://api.test.com/auth/google/callback",
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: "calendar-token-key",
      S3_REGION: "ap-south-1",
      S3_BUCKET: "private-bucket",
      SQS_VOICE_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/voice",
      SQS_CALENDAR_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/calendar",
      SQS_REMINDER_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/reminder",
      SQS_EXPORT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/export",
    };
    const parameterValues = Object.fromEntries(
      Object.entries(secretValues).map(([key, value]) => [`${parameterPath}${key}`, value]),
    );

    const result = await loadManagedSecrets({
      appEnv: "staging",
      parameterPath,
      ssmClient: {
        send: async (command) => {
          const names = [...(command.input.Names ?? [])];
          sentNames.push(names);
          return {
            Parameters: names.map((name) => ({
              Name: name,
              Value: parameterValues[name],
            })),
          };
        },
      },
    });

    expect(sentNames).toHaveLength(2);
    expect(sentNames[0]).toHaveLength(10);
    expect(sentNames[1]).toHaveLength(9);
    expect(result).toEqual(secretValues);
  });

  it("does not leak secret values when a managed secret is missing", async () => {
    const parameterPath = "/physio/staging/";
    const secretValues = {
      DATABASE_URL: "postgresql://secret-db",
      JWT_ACCESS_SECRET: "access-secret",
      JWT_REFRESH_SECRET: "refresh-secret",
      ACCESS_TOKEN_TTL_SECONDS: "900",
      REFRESH_TOKEN_TTL_SECONDS: "604800",
      BCRYPT_COST_FACTOR: "12",
      AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: "5",
      AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: "10",
      SARVAM_API_KEY: "sarvam-secret",
      GOOGLE_CALENDAR_CLIENT_ID: "calendar-client-id",
      GOOGLE_CALENDAR_CLIENT_SECRET: "calendar-client-secret",
      GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: "calendar-token-key",
      S3_REGION: "ap-south-1",
      S3_BUCKET: "private-bucket",
      SQS_VOICE_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/voice",
      SQS_CALENDAR_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/calendar",
      SQS_REMINDER_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/reminder",
      SQS_EXPORT_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/123/export",
    };

    await expect(
      loadManagedSecrets({
        appEnv: "staging",
        parameterPath,
        ssmClient: {
          send: async () => ({
            Parameters: Object.entries(secretValues).map(([key, value]) => ({
              Name: `${parameterPath}${key}`,
              Value: value,
            })),
          }),
        },
      }),
    ).rejects.toThrow("Missing managed secret: GOOGLE_CALENDAR_REDIRECT_URI");

    await loadManagedSecrets({
      appEnv: "staging",
      parameterPath,
      ssmClient: {
        send: async () => ({
          Parameters: Object.entries(secretValues).map(([key, value]) => ({
            Name: `${parameterPath}${key}`,
            Value: value,
          })),
        }),
      },
    }).catch((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("postgresql://secret-db");
      expect(message).not.toContain("access-secret");
      expect(message).not.toContain("calendar-client-secret");
    });
  });
});

describe("logger redaction", () => {
  it("redacts auth credentials and token headers", () => {
    const logPayload = redactSensitiveFields({
      password: "super-secret",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      authorization: "Bearer token",
      cookie: "session=abcd",
      requestId: "req-123",
    });

    expect(logPayload).toEqual({
      password: "[REDACTED]",
      accessToken: "[REDACTED]",
      refreshToken: "[REDACTED]",
      authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      requestId: "req-123",
    });
  });

  it("redacts raw clinical fields", () => {
    const logPayload = redactSensitiveFields({
      clinicalText: "patient has severe lumbar pain",
      transcript: "visit transcript text",
      correlationId: "corr-123",
    });

    expect(logPayload).toEqual({
      clinicalText: "[REDACTED]",
      transcript: "[REDACTED]",
      correlationId: "corr-123",
    });
  });

  it("preserves correlation metadata", () => {
    const logPayload = redactSensitiveFields({
      requestId: "req-123",
      correlationId: "corr-123",
      errorClass: "ValidationError",
      password: "secret",
    });

    expect(logPayload.requestId).toBe("req-123");
    expect(logPayload.correlationId).toBe("corr-123");
    expect(logPayload.errorClass).toBe("ValidationError");
  });

  it("redacts transcript field from logged objects", () => {
    const logPayload = redactSensitiveFields({
      jobId: "job-123",
      transcript: "patient reported severe back pain after lifting weights",
      clinicId: "clinic-1",
    });

    expect(logPayload.transcript).toBe("[REDACTED]");
    expect(logPayload.jobId).toBe("job-123");
    expect(logPayload.clinicId).toBe("clinic-1");
  });

  it("redacts clinicalText field from logged objects", () => {
    const logPayload = redactSensitiveFields({
      sessionId: "session-456",
      clinicalText: "L4-L5 disc herniation with radiculopathy",
      userId: "user-1",
    });

    expect(logPayload.clinicalText).toBe("[REDACTED]");
    expect(logPayload.sessionId).toBe("session-456");
    expect(logPayload.userId).toBe("user-1");
  });

  it("redacts audioUrl and s3Url to prevent token leakage", () => {
    const logPayload = redactSensitiveFields({
      audioUrl: "https://s3.amazonaws.com/bucket/audio.m4a?X-Amz-Signature=abc123",
      s3Url: "https://s3.amazonaws.com/bucket/file.pdf?token=secret",
      jobId: "job-789",
    });

    expect(logPayload.audioUrl).toBe("[REDACTED]");
    expect(logPayload.s3Url).toBe("[REDACTED]");
    expect(logPayload.jobId).toBe("job-789");
  });

  it("retentionService deletion logs do not contain transcript text", () => {
    // Simulate the exact payload structure used by retentionService.deleteAudioAndTranscript
    const retentionLogPayload = redactSensitiveFields({
      jobId: "job-abc",
      clinicId: "clinic-1",
    });

    expect(retentionLogPayload).toEqual({
      jobId: "job-abc",
      clinicId: "clinic-1",
    });
    expect(retentionLogPayload).not.toHaveProperty("transcript");
    expect(retentionLogPayload).not.toHaveProperty("clinicalText");
    expect(retentionLogPayload).not.toHaveProperty("audioUrl");
  });
});
