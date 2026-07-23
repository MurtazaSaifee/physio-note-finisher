import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type PrismaModelClient = {
  count: <T = unknown>(...args: unknown[]) => Promise<T>;
  create: <T = unknown>(...args: unknown[]) => Promise<T>;
  createMany: <T = unknown>(...args: unknown[]) => Promise<T>;
  delete: <T = unknown>(...args: unknown[]) => Promise<T>;
  deleteMany: <T = unknown>(...args: unknown[]) => Promise<T>;
  update: <T = unknown>(...args: unknown[]) => Promise<T>;
  updateMany: <T = unknown>(...args: unknown[]) => Promise<T>;
  upsert: <T = unknown>(...args: unknown[]) => Promise<T>;
  findMany: <T = unknown>(...args: unknown[]) => Promise<T>;
  findFirst: <T = unknown>(...args: unknown[]) => Promise<T>;
  findFirstOrThrow: <T = unknown>(...args: unknown[]) => Promise<T>;
  findUnique: <T = unknown>(...args: unknown[]) => Promise<T>;
};

const FALLBACK_MODEL_METHODS = [
  "count",
  "create",
  "createMany",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "upsert",
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
] as const satisfies ReadonlyArray<keyof PrismaModelClient>;

const FALLBACK_MODEL_NAMES = [
  "clinic",
  "patient",
  "session",
  "progressNote",
  "customTemplateCategory",
  "customTemplate",
  "customTemplateCategoryLink",
  "appointment",
  "clinicianNotificationPreference",
  "devicePushToken",
  "googleCalendarConnection",
  "googleCalendarOAuthState",
  "user",
  "refreshToken",
  "exportRecord",
  "auditEvent",
  "otpState",
  "voiceJob",
  "patientConsent",
  "reminderDispatch",
] as const;

const globalForPrisma = globalThis as typeof globalThis & {
  __physioPrismaClient?: PrismaClient;
};

function createFallbackModelClient(modelName: string): PrismaModelClient {
  const missingClient = async (): Promise<never> => {
    throw new Error(
      `Prisma client is not configured for ${modelName}. Set DATABASE_URL to use the real client.`,
    );
  };

  return Object.fromEntries(
    FALLBACK_MODEL_METHODS.map((methodName) => [methodName, missingClient]),
  ) as unknown as PrismaModelClient;
}

function createFallbackPrismaClient(): PrismaClient {
  const fallbackClient = Object.fromEntries(
    FALLBACK_MODEL_NAMES.map((modelName) => [
      modelName,
      createFallbackModelClient(modelName),
    ]),
  );

  return {
    ...fallbackClient,
    $transaction: async (): Promise<never> => {
      throw new Error(
        "Prisma client is not configured for transactions. Set DATABASE_URL to use the real client.",
      );
    },
    $disconnect: async () => undefined,
  } as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return createFallbackPrismaClient();
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
  });

  return new PrismaClient({ adapter });
}

function ensurePrismaClient(): PrismaClient {
  const cached = globalForPrisma.__physioPrismaClient;
  if (cached && "auditEvent" in cached) {
    return cached;
  }
  return createPrismaClient();
}

export const prisma: PrismaClient = ensurePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__physioPrismaClient = prisma;
}

export default prisma;
