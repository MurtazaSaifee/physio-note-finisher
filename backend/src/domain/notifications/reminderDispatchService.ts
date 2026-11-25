import type { ReminderTimingOption } from "../../../../shared/contracts/appointments.js";
import { prisma } from "../../data/prismaClient.js";
import { createLogger } from "../../observability/logger.js";
import { sendReminderPush } from "./expoPushProvider.js";
import { isValidExpoPushToken } from "./reminderPreferenceService.js";

const logger = createLogger({ component: "reminderDispatchService" });

export function buildReminderText(patientName: string, scheduledAt: string): string {
  const date = new Date(scheduledAt);
  const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  let hour = date.getUTCHours();
  const minute = date.getUTCMinutes().toString().padStart(2, "0");
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  const timeStr = `${hour}:${minute} ${ampm}`;
  return `You have an appointment with ${patientName} on ${month} ${day}, ${year} at ${timeStr}.`;
}

export function scheduleReminderDispatch(input: {
  patientName: string;
  scheduledAt: string;
  timingPreference: ReminderTimingOption;
}): { reminderText: string; sendAt: string } {
  const scheduledDate = new Date(input.scheduledAt);
  const offsetMs = timingToMilliseconds(input.timingPreference);
  const sendAt = new Date(scheduledDate.getTime() - offsetMs);

  return {
    reminderText: buildReminderText(input.patientName, input.scheduledAt),
    sendAt: sendAt.toISOString(),
  };
}

function timingToMilliseconds(timing: ReminderTimingOption): number {
  switch (timing) {
    case "30m":
      return 30 * 60 * 1000;
    case "1h":
      return 60 * 60 * 1000;
    case "2h":
      return 2 * 60 * 60 * 1000;
    case "1d":
      return 24 * 60 * 60 * 1000;
    default:
      return 30 * 60 * 1000;
  }
}

// ---- Dispatch persistence ----

/**
 * Finds reminder dispatches that are due to be sent (status=pending, dispatchAt <= now).
 */
export async function findDueReminderDispatches(now: Date) {
  return prisma.reminderDispatch.findMany({
    where: {
      status: "pending",
      dispatchAt: { lte: now },
    },
  });
}

/**
 * Processes all due reminder dispatches: validates tokens, sends push notifications,
 * and records results durably. Only includes appointment reminder metadata —
 * no SOAP, transcript, or diagnosis content.
 */
export async function sendDueReminderBatch(
  now: Date,
): Promise<{ sent: number; failed: number }> {
  const dispatches = await findDueReminderDispatches(now);

  if (dispatches.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const dispatch of dispatches) {
    try {
      // Look up the device push token
      if (!dispatch.devicePushTokenId) {
        await markDispatchFailed(
          dispatch.id,
          "No device push token registered",
        );
        failed++;
        continue;
      }

      const deviceToken = await prisma.devicePushToken.findUnique({
        where: { id: dispatch.devicePushTokenId },
      });

      if (!deviceToken) {
        await markDispatchFailed(dispatch.id, "Device push token not found");
        failed++;
        continue;
      }

      const expoToken = deviceToken.expoPushToken;

      // Validate token format before sending
      if (!isValidExpoPushToken(expoToken)) {
        await markDispatchFailed(dispatch.id, `Invalid Expo push token format`);
        failed++;
        continue;
      }

      // Build the push notification payload
      const reminderText = buildReminderText(
        dispatch.patientName,
        dispatch.scheduledAt.toISOString(),
      );
      const title = "Upcoming appointment";

      // Send push — only appointment metadata, no clinical content
      const results = await sendReminderPush([expoToken], title, reminderText);
      const firstResult = results[0];

      if (firstResult && firstResult.status === "ok") {
        // Record success with ticket ID
        await prisma.reminderDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: "sent",
            ticketId: firstResult.ticketId ?? null,
            dispatchedAt: new Date(),
          },
        });
        sent++;
        logger.info("reminder.dispatch.sent", {
          dispatchId: dispatch.id,
          appointmentId: dispatch.appointmentId,
          ticketId: firstResult.ticketId,
        });
      } else {
        const errorMsg = firstResult
          ? (firstResult.error ?? "Unknown push error")
          : "No push results returned";
        await markDispatchFailed(dispatch.id, errorMsg);
        failed++;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dispatch error";
      await markDispatchFailed(dispatch.id, message);
      failed++;
      logger.error("reminder.dispatch.failed", {
        dispatchId: dispatch.id,
        errorClass: error instanceof Error ? error.name : "UnknownError",
        message,
      });
    }
  }

  return { sent, failed };
}

async function markDispatchFailed(
  dispatchId: string,
  errorMessage: string,
): Promise<void> {
  await prisma.reminderDispatch.update({
    where: { id: dispatchId },
    data: {
      status: "failed",
      errorMessage,
      dispatchedAt: new Date(),
    },
  });
}
