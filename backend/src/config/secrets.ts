import {
  GetParametersCommand,
  SSMClient,
  type SSMClientConfig,
} from "@aws-sdk/client-ssm";

import type { AppEnv } from "./env.js";

export const REQUIRED_MANAGED_SECRET_KEYS = [
  "DATABASE_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "ACCESS_TOKEN_TTL_SECONDS",
  "REFRESH_TOKEN_TTL_SECONDS",
  "BCRYPT_COST_FACTOR",
  "AUTH_LOGIN_RATE_LIMIT_PER_MINUTE",
  "AUTH_REFRESH_RATE_LIMIT_PER_MINUTE",
  "SARVAM_API_KEY",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
  "S3_REGION",
  "S3_BUCKET",
  "SQS_VOICE_QUEUE_URL",
  "SQS_CALENDAR_QUEUE_URL",
  "SQS_REMINDER_QUEUE_URL",
  "SQS_EXPORT_QUEUE_URL",
] as const;

type ManagedSecretKey = (typeof REQUIRED_MANAGED_SECRET_KEYS)[number];

type SsmClientLike = {
  send(command: GetParametersCommand): Promise<{
    Parameters?: Array<{ Name?: string; Value?: string }>;
  }>;
};

type LoadManagedSecretsOptions = {
  appEnv: AppEnv;
  parameterPath?: string;
  ssmClient?: SsmClientLike;
};

const SSM_GET_PARAMETERS_MAX_NAMES = 10;

function createSsmClient(): SSMClient {
  const config: SSMClientConfig = {};
  const region = process.env.AWS_REGION ?? process.env.S3_REGION;
  if (region) {
    config.region = region;
  }
  return new SSMClient(config);
}

function secretKeyFromName(name: string, parameterPath: string): string {
  return name.startsWith(parameterPath) ? name.slice(parameterPath.length) : name;
}

function chunkNames(names: string[]): string[][] {
  const chunks: string[][] = [];

  for (let index = 0; index < names.length; index += SSM_GET_PARAMETERS_MAX_NAMES) {
    chunks.push(names.slice(index, index + SSM_GET_PARAMETERS_MAX_NAMES));
  }

  return chunks;
}

export async function loadManagedSecrets(
  options: LoadManagedSecretsOptions,
): Promise<Record<ManagedSecretKey, string> | Record<string, never>> {
  const { appEnv } = options;

  if (appEnv === "local") {
    return {};
  }

  const parameterPath = options.parameterPath ?? `/physio/${appEnv}/`;
  const ssmClient = options.ssmClient ?? createSsmClient();
  const secrets = new Map<string, string>();
  const parameterNames = REQUIRED_MANAGED_SECRET_KEYS.map((key) => `${parameterPath}${key}`);

  for (const names of chunkNames(parameterNames)) {
    const response = await ssmClient.send(
      new GetParametersCommand({
        Names: names,
        WithDecryption: true,
      }),
    );

    for (const parameter of response.Parameters ?? []) {
      if (!parameter.Name || parameter.Value === undefined) {
        continue;
      }
      secrets.set(secretKeyFromName(parameter.Name, parameterPath), parameter.Value);
    }
  }

  for (const key of REQUIRED_MANAGED_SECRET_KEYS) {
    if (!secrets.get(key)) {
      throw new Error(`Missing managed secret: ${key}`);
    }
  }

  return Object.fromEntries(
    REQUIRED_MANAGED_SECRET_KEYS.map((key) => [key, secrets.get(key)!]),
  ) as Record<ManagedSecretKey, string>;
}

export async function applyManagedSecrets(appEnv: AppEnv): Promise<void> {
  const secrets = await loadManagedSecrets({ appEnv });

  for (const [key, value] of Object.entries(secrets)) {
    process.env[key] = value;
  }
}
