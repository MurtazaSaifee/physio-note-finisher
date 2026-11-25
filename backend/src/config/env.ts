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
  GOOGLE_CALENDAR_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CALENDAR_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CALENDAR_REDIRECT_URI: z.string().url().optional(),
});

const NON_LOCAL_JWT_SECRET_MIN_LENGTH = 32;

const voiceEnvSchema = z.object({
  VOICE_PROVIDER_DEFAULT: z.string().min(1).default("sarvam"),
  VOICE_LLM_DEFAULT_MODEL: z.string().min(1).default("sarvam-105b"),
  VOICE_STT_DEFAULT_MODEL: z.string().min(1).default("saaras:v3"),
  VOICE_PROVIDER_MATRIX_JSON: z.string().optional(),
  SARVAM_API_KEY: z.string().optional(),
});

const s3EnvSchema = z.object({
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
  PRESIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  PRESIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

const sqsEnvSchema = z.object({
  AWS_REGION: z.string().min(1).optional(),
  SQS_VOICE_QUEUE_URL: z.string().url().optional(),
  SQS_CALENDAR_QUEUE_URL: z.string().url().optional(),
  SQS_REMINDER_QUEUE_URL: z.string().url().optional(),
  SQS_EXPORT_QUEUE_URL: z.string().url().optional(),
  SQS_WAIT_TIME_SECONDS: z.coerce.number().int().min(1).max(20).default(20),
});

const emailOtpEnvSchema = z.object({
  SES_FROM_EMAIL: z
    .string()
    .trim()
    .email("SES_FROM_EMAIL must be a valid email address")
    .default("no-reply@example.com"),
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

export type S3RuntimeConfig = {
  region: string | undefined;
  bucket: string | undefined;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  endpoint: string | undefined;
  forcePathStyle: boolean | undefined;
  presignedUploadTtlSeconds: number;
  presignedDownloadTtlSeconds: number;
};

export type SqsRuntimeConfig = {
  awsRegion: string | undefined;
  voiceQueueUrl: string | undefined;
  calendarQueueUrl: string | undefined;
  reminderQueueUrl: string | undefined;
  exportQueueUrl: string | undefined;
  waitTimeSeconds: number;
};

export type EmailOtpRuntimeConfig = {
  sesFromEmail: string;
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

/**
 * Treat blank values and copied-in placeholders (e.g. `replace-with-...`) as
 * "not configured", so an untouched .env.example never looks like a real key.
 */
export function normalizeApiKey(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^(replace-with|your-|changeme|<)/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
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
    llmDefaultModel: parsed.data.VOICE_LLM_DEFAULT_MODEL ?? "sarvam-105b",
    sttDefaultModel: parsed.data.VOICE_STT_DEFAULT_MODEL ?? "saaras:v3",
    providerMatrixJson: parsed.data.VOICE_PROVIDER_MATRIX_JSON ?? undefined,
    sarvamApiKey: normalizeApiKey(parsed.data.SARVAM_API_KEY),
  };
}

export function parseS3Env(
  source: NodeJS.ProcessEnv = process.env,
): S3RuntimeConfig {
  const parsed = s3EnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid S3 environment configuration: ${details}`);
  }

  return {
    region: parsed.data.S3_REGION ?? undefined,
    bucket: parsed.data.S3_BUCKET ?? undefined,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID ?? undefined,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY ?? undefined,
    endpoint: parsed.data.S3_ENDPOINT ?? undefined,
    forcePathStyle: parsed.data.S3_FORCE_PATH_STYLE === "true" ? true : undefined,
    presignedUploadTtlSeconds: parsed.data.PRESIGNED_UPLOAD_TTL_SECONDS,
    presignedDownloadTtlSeconds: parsed.data.PRESIGNED_DOWNLOAD_TTL_SECONDS,
  };
}

export function parseSqsEnv(
  source: NodeJS.ProcessEnv = process.env,
): SqsRuntimeConfig {
  const parsed = sqsEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid SQS environment configuration: ${details}`);
  }

  return {
    awsRegion: parsed.data.AWS_REGION ?? undefined,
    voiceQueueUrl: parsed.data.SQS_VOICE_QUEUE_URL ?? undefined,
    calendarQueueUrl: parsed.data.SQS_CALENDAR_QUEUE_URL ?? undefined,
    reminderQueueUrl: parsed.data.SQS_REMINDER_QUEUE_URL ?? undefined,
    exportQueueUrl: parsed.data.SQS_EXPORT_QUEUE_URL ?? undefined,
    waitTimeSeconds: parsed.data.SQS_WAIT_TIME_SECONDS,
  };
}

export function parseEmailOtpEnv(
  source: NodeJS.ProcessEnv = process.env,
): EmailOtpRuntimeConfig {
  const parsed = emailOtpEnvSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    throw new Error(`Invalid email OTP environment configuration: ${details}`);
  }

  return {
    sesFromEmail: parsed.data.SES_FROM_EMAIL,
  };
}

export function shouldUseSesEmailOtp(
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseAppEnv(source) !== "local" || source.LOCAL_USE_SES_EMAIL_OTP === "true";
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
