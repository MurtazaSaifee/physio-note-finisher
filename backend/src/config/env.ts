import { z } from "zod";

const appEnvSchema = z
  .enum(["local", "staging", "production"])
  .default("local");

const securityEnvSchema = z.object({
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive("ACCESS_TOKEN_TTL_SECONDS must be a positive integer"),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive("REFRESH_TOKEN_TTL_SECONDS must be a positive integer"),
  BCRYPT_COST_FACTOR: z.coerce
    .number()
    .int()
    .min(8, "BCRYPT_COST_FACTOR must be at least 8")
    .max(15, "BCRYPT_COST_FACTOR must be at most 15"),
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive("AUTH_LOGIN_RATE_LIMIT_PER_MINUTE must be a positive integer"),
  AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive("AUTH_REFRESH_RATE_LIMIT_PER_MINUTE must be a positive integer"),
});

const NON_LOCAL_JWT_SECRET_MIN_LENGTH = 32;

const voiceEnvSchema = z.object({
  VOICE_PROVIDER_DEFAULT: z.string().min(1).default("sarvam"),
  VOICE_LLM_DEFAULT_MODEL: z.string().min(1).default("sarvam-30b"),
  VOICE_STT_DEFAULT_MODEL: z.string().min(1).default("saaras:v3"),
  VOICE_PROVIDER_MATRIX_JSON: z.string().optional(),
  SARVAM_API_KEY: z.string().min(1).optional(),
});

const schedulerEnvSchema = z.object({
  RETENTION_SCHEDULER_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  RETENTION_SCHEDULER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
});

export type SecurityRuntimeConfig = {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  bcryptCostFactor: number;
  authLoginRateLimitPerMinute: number;
  authRefreshRateLimitPerMinute: number;
};

export type VoiceRuntimeConfig = {
  providerDefault: string;
  llmDefaultModel: string;
  sttDefaultModel: string;
  providerMatrixJson: string | undefined;
  sarvamApiKey: string | undefined;
};

export type SchedulerRuntimeConfig = {
  retentionSchedulerEnabled: boolean;
  retentionSchedulerIntervalMs: number;
};

export type AppEnv = z.infer<typeof appEnvSchema>;

export function parseAppEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = appEnvSchema.safeParse(source.APP_ENV);

  if (!parsed.success) {
    throw new Error("Invalid APP_ENV. Expected local, staging, or production.");
  }

  return parsed.data;
}

export function assertRuntimeEnvConsistency(
  source: NodeJS.ProcessEnv = process.env,
): void {
  const nodeEnv = source.NODE_ENV;
  const appEnv = parseAppEnv(source);

  if ((nodeEnv === "production" || nodeEnv === "staging") && appEnv === "local") {
    throw new Error("APP_ENV must be staging or production when NODE_ENV is non-local.");
  }

  if (appEnv === "staging" && nodeEnv !== "staging") {
    throw new Error("NODE_ENV must be staging when APP_ENV=staging.");
  }

  if (appEnv === "production" && nodeEnv !== "production") {
    throw new Error("NODE_ENV must be production when APP_ENV=production.");
  }
}

export function parseSecurityEnv(
  source: NodeJS.ProcessEnv = process.env,
): SecurityRuntimeConfig {
  const parsed = securityEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid security environment configuration: ${details}`);
  }

  assertRuntimeEnvConsistency(source);
  const appEnv = parseAppEnv(source);
  if (appEnv !== "local") {
    const issues: string[] = [];
    if (parsed.data.JWT_ACCESS_SECRET.length < NON_LOCAL_JWT_SECRET_MIN_LENGTH) {
      issues.push(
        `JWT_ACCESS_SECRET: must be at least ${NON_LOCAL_JWT_SECRET_MIN_LENGTH} characters outside local`,
      );
    }
    if (parsed.data.JWT_REFRESH_SECRET.length < NON_LOCAL_JWT_SECRET_MIN_LENGTH) {
      issues.push(
        `JWT_REFRESH_SECRET: must be at least ${NON_LOCAL_JWT_SECRET_MIN_LENGTH} characters outside local`,
      );
    }
    if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
      issues.push("JWT_REFRESH_SECRET: must differ from JWT_ACCESS_SECRET outside local");
    }
    if (issues.length > 0) {
      throw new Error(
        `Invalid security environment configuration: ${issues.join("; ")}`,
      );
    }
  }

  return {
    jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
    jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
    accessTokenTtlSeconds: parsed.data.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: parsed.data.REFRESH_TOKEN_TTL_SECONDS,
    bcryptCostFactor: parsed.data.BCRYPT_COST_FACTOR,
    authLoginRateLimitPerMinute: parsed.data.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
    authRefreshRateLimitPerMinute:
      parsed.data.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE,
  };
}

export function parseVoiceEnv(
  source: NodeJS.ProcessEnv = process.env,
): VoiceRuntimeConfig {
  const parsed = voiceEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid voice environment configuration: ${details}`);
  }

  return {
    providerDefault: parsed.data.VOICE_PROVIDER_DEFAULT,
    llmDefaultModel: parsed.data.VOICE_LLM_DEFAULT_MODEL ?? "sarvam-30b",
    sttDefaultModel: parsed.data.VOICE_STT_DEFAULT_MODEL ?? "saaras:v3",
    providerMatrixJson: parsed.data.VOICE_PROVIDER_MATRIX_JSON ?? undefined,
    sarvamApiKey: parsed.data.SARVAM_API_KEY ?? undefined,
  };
}

export function parseSchedulerEnv(
  source: NodeJS.ProcessEnv = process.env,
): SchedulerRuntimeConfig {
  const parsed = schedulerEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid scheduler environment configuration: ${details}`);
  }

  return {
    retentionSchedulerEnabled: parsed.data.RETENTION_SCHEDULER_ENABLED === "true",
    retentionSchedulerIntervalMs: parsed.data.RETENTION_SCHEDULER_INTERVAL_MS,
  };
}
