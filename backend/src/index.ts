import "dotenv/config";
import { prisma } from "./data/prismaClient.js";
import { hashUserPassword } from "./api/routes/auth.js";
import { PrismaAuthRepository } from "./domain/auth/prismaAuthRepository.js";
import type { AuthRepository } from "./domain/auth/authRepository.js";
import { buildServer } from "./server.js";
import { parseSchedulerEnv, parseSecurityEnv } from "./config/env.js";
import { startRetentionScheduler } from "./workers/retentionScheduler.js";
import { deleteObject } from "./infrastructure/storage/localStorageProvider.js";
import type { RetentionPeriod } from "./domain/audio/retentionService.js";
import { resolveVoiceProviders } from "./domain/voice/providers/providerRegistry.js";

const DEV_CLINIC_ID = "clinic-dev";
const DEV_CLINIC_NAME = "Physio Note Finisher Dev Clinic";
const DEV_CLINICIAN_EMAIL = "clinician@example.com";
const DEV_CLINICIAN_NAME = "Dr Physio";

async function seedDevClinic(): Promise<void> {
  await prisma.clinic.upsert({
    where: {
      id: DEV_CLINIC_ID,
    },
    update: {
      name: DEV_CLINIC_NAME,
    },
    create: {
      id: DEV_CLINIC_ID,
      name: DEV_CLINIC_NAME,
    },
  });
}

async function seedDevClinician(repository: AuthRepository): Promise<void> {
  const password = process.env.DEV_CLINICIAN_PASSWORD?.trim();
  if (!password) {
    return;
  }

  const passwordHash = await hashUserPassword(password);

  const existing = await repository.findUserByEmail(DEV_CLINICIAN_EMAIL);
  if (existing) {
    return;
  }

  const user = {
    id: "dev-clinician-user",
    clinicId: DEV_CLINIC_ID,
    email: DEV_CLINICIAN_EMAIL,
    name: DEV_CLINICIAN_NAME,
    firstName: "Dr",
    lastName: "Physio",
    emailVerified: true,
    passwordHash,
    tokenVersion: 1,
  };

  await repository.createUser(user);
}

async function main(): Promise<void> {
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (nodeEnv === "production") {
    throw new Error("backend/src/index.ts is a local dev entrypoint only");
  }

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to start the local dev backend");
  }

  // Fail fast on missing or invalid critical security configuration
  parseSecurityEnv();
  const voiceProviders = resolveVoiceProviders();

  await seedDevClinic();

  const repository = new PrismaAuthRepository();
  await seedDevClinician(repository);

  const app = await buildServer({ repository, voiceProviders });
  const port = Number(process.env.PORT?.trim() || "3000");

  await app.listen({
    host: "0.0.0.0",
    port,
  });

  // Retention scheduler is enabled only when explicitly configured.
  const schedulerConfig = parseSchedulerEnv();
  if (schedulerConfig.retentionSchedulerEnabled) {
    startRetentionScheduler({
      intervalMs: schedulerConfig.retentionSchedulerIntervalMs,
      deleteStoredObject: deleteObject,
      async resolveRetentionPeriod(clinicId) {
        // Dev fallback: resolve from the seeded dev clinician's policy
        const devUser = await repository.findUserByEmail(DEV_CLINICIAN_EMAIL);
        if (devUser && devUser.clinicId === clinicId) {
          const period = devUser.audioRetentionPeriod;
          if (period === "7d" || period === "30d" || period === "90d" || period === "forever") {
            return period as RetentionPeriod;
          }
        }
        return undefined;
      },
    });
  }

  process.stdout.write(
    `Dev backend listening on http://0.0.0.0:${port}\n` +
      `Dev clinician: ${DEV_CLINICIAN_EMAIL}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
