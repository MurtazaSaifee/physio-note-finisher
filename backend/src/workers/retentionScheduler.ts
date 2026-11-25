import type { VoiceJobStore } from "../domain/voice/voiceJobService.js";
import { defaultStore } from "../domain/voice/voiceJobService.js";
import { registerRetentionWorker } from "./retentionWorker.js";
import { createLogger } from "../observability/logger.js";
import type { RetentionPeriod } from "../domain/audio/retentionService.js";

const logger = createLogger({ component: "retentionScheduler" });

export type RetentionScheduler = {
  intervalId: ReturnType<typeof setInterval>;
};

type StartRetentionSchedulerOptions = {
  intervalMs?: number;
  store?: VoiceJobStore;
  s3DeleteObject?(keyOrUrl: string): Promise<void>;
  resolveRetentionPeriod?(clinicId: string): Promise<RetentionPeriod | undefined>;
};

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startRetentionScheduler(
  options: StartRetentionSchedulerOptions = {},
): RetentionScheduler {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const store = options.store ?? defaultStore;
  const s3DeleteObject = options.s3DeleteObject;
  const resolveRetentionPeriod = options.resolveRetentionPeriod;

  logger.info("retention.scheduler.started", {
    intervalMs,
  });

  let isRunning = false;

  const intervalId = setInterval(async () => {
    if (isRunning) {
      logger.warn("retention.scheduler.tick_skipped_overlap");
      return;
    }
    isRunning = true;
    try {
      const worker = registerRetentionWorker(store, s3DeleteObject);
      const clinicIds = new Set<string>();
      const jobs = await store.findAll();
      for (const job of jobs) {
        clinicIds.add(job.clinicId);
      }

      for (const clinicId of clinicIds) {
        const retentionPeriod = await resolveRetentionPeriod?.(clinicId) ?? "30d";
        const result = await worker.runRetentionJob({
          clinicId,
          retentionPeriod,
        });
        if (result.deletedCount > 0) {
          logger.info("retention.scheduler.batch_completed", {
            clinicId,
            deletedCount: result.deletedCount,
          });
        }
      }
    } catch (error) {
      logger.warn("retention.scheduler.tick_failed", {
        errorClass: error instanceof Error ? error.name : "UnknownError",
      });
    } finally {
      isRunning = false;
    }
  }, intervalMs);

  return { intervalId };
}

export function stopRetentionScheduler(
  scheduler: RetentionScheduler,
): void {
  clearInterval(scheduler.intervalId);
  logger.info("retention.scheduler.stopped");
}
