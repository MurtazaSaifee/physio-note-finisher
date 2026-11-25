import { sendDueReminderBatch } from "../domain/notifications/reminderDispatchService.js";
import { createLogger } from "../observability/logger.js";

export const REMINDER_DISPATCH_QUEUE = "reminder-dispatch";
export const REMINDER_DISPATCH_JOB = "dispatch_due_reminders";
export const REMINDER_DISPATCH_INTERVAL_MS = 15 * 60 * 1000;

const logger = createLogger({ component: "reminderWorker" });

export async function processReminderJob(
  jobName: string,
  jobId: string,
): Promise<void> {
  logger.info("reminder.worker.job_started", { jobName, jobId });

  if (jobName !== REMINDER_DISPATCH_JOB) {
    logger.warn("reminder.worker.unknown_job", { jobName });
    return;
  }

  try {
    const now = new Date();
    const results = await sendDueReminderBatch(now);
    logger.info("reminder.worker.batch_completed", {
      sent: results.sent,
      failed: results.failed,
    });
  } catch (error) {
    logger.error("reminder.worker.job_failed", {
      errorClass: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
