import "dotenv/config";
import { prisma } from "./data/prismaClient.js";
import { PrismaAuthRepository } from "./domain/auth/prismaAuthRepository.js";
import { buildServer } from "./server.js";
import { parseSchedulerEnv, parseSecurityEnv } from "./config/env.js";
import { startRetentionScheduler } from "./workers/retentionScheduler.js";
import { deleteObject } from "./infrastructure/s3/s3Client.js";
import type { RetentionPeriod } from "./domain/audio/retentionService.js";

const RETENTION_PERIODS = new Set<RetentionPeriod>(["7d", "30d", "90d", "forever"]);

/**
 * Local development entrypoint. Demo data (clinic, clinician login, patients)
 * comes from `npm run db:setup` (backend/prisma/seed.ts), not from here.
 * Deployed environments start through src/entry/api.ts and src/entry/worker.ts.
 */
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

  const repository = new PrismaAuthRepository();
  const app = await buildServer({ repository });
  const port = Number(process.env.PORT?.trim() || "3000");

  await app.listen({ host: "0.0.0.0", port });

  // Retention scheduler: enabled only when explicitly configured.
  const schedulerConfig = parseSchedulerEnv();
  if (schedulerConfig.retentionSchedulerEnabled) {
    startRetentionScheduler({
      intervalMs: schedulerConfig.retentionSchedulerIntervalMs,
      s3DeleteObject: deleteObject,
      async resolveRetentionPeriod(clinicId) {
        const clinician = await prisma.user.findFirst({
          where: { clinicId },
          orderBy: { createdAt: "asc" },
          select: { audioRetentionPeriod: true },
        });
        const period = clinician?.audioRetentionPeriod as RetentionPeriod | undefined;
        return period && RETENTION_PERIODS.has(period) ? period : undefined;
      },
    });
  }

  process.stdout.write(
    `Dev backend listening on http://0.0.0.0:${port}\n` +
      "Demo login (after `npm run db:setup`): clinician@example.com / password123\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
