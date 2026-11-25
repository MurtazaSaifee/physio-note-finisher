import "dotenv/config";

import { parseAppEnv, parseSchedulerEnv, parseSecurityEnv, parseSqsEnv } from "../config/env.js";
import { applyManagedSecrets } from "../config/secrets.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger({ component: "workerEntry" });

type PollerHandle = {
  stop(): Promise<void>;
};

async function main(): Promise<void> {
  const appEnv = parseAppEnv();
  await applyManagedSecrets(appEnv);
  parseSecurityEnv();
  const sqsConfig = parseSqsEnv();
  const schedulerConfig = parseSchedulerEnv();
  const [
    { prisma },
    { deleteObject },
    { PrismaVoiceJobStore },
    { resolveVoiceProviders },
    { startRetentionScheduler, stopRetentionScheduler },
    { startSqsCalendarPoller },
    { startSqsExportPoller },
    { startSqsReminderPoller },
    { startSqsVoicePoller },
  ] = await Promise.all([
    import("../data/prismaClient.js"),
    import("../infrastructure/s3/s3Client.js"),
    import("../domain/voice/voiceJobService.js"),
    import("../domain/voice/providers/providerRegistry.js"),
    import("../workers/retentionScheduler.js"),
    import("../workers/sqsCalendarPoller.js"),
    import("../workers/sqsExportPoller.js"),
    import("../workers/sqsReminderPoller.js"),
    import("../workers/sqsVoicePoller.js"),
  ]);
  const voiceProviders = resolveVoiceProviders();
  if (
    appEnv !== "local" &&
    (!voiceProviders?.sttProvider ||
      !voiceProviders.clinicalNoteProvider ||
      !voiceProviders.patientSummaryProvider)
  ) {
    throw new Error("Voice providers are required for staging and production workers");
  }
  const voiceJobStore = new PrismaVoiceJobStore(prisma);

  const pollers: PollerHandle[] = [
    startSqsVoicePoller(sqsConfig, voiceProviders, { store: voiceJobStore }),
    startSqsCalendarPoller(sqsConfig),
    startSqsReminderPoller(sqsConfig),
    startSqsExportPoller(sqsConfig),
  ];

  if (appEnv !== "local" || schedulerConfig.retentionSchedulerEnabled) {
    const retentionScheduler = startRetentionScheduler({
      intervalMs: schedulerConfig.retentionSchedulerIntervalMs,
      store: voiceJobStore,
      s3DeleteObject: deleteObject,
    });
    pollers.push({
      async stop() {
        stopRetentionScheduler(retentionScheduler);
      },
    });
  }

  logger.info("physio.worker.started", { pollerCount: pollers.length });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("physio.worker.stopping", { signal });
    await Promise.all(pollers.map((poller) => poller.stop()));
    logger.info("physio.worker.stopped", { signal });
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

main().catch((error) => {
  logger.error("physio.worker.start_failed", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
