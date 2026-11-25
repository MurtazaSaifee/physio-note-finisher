import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import { createLogger } from "../../observability/logger.js";

const logger = createLogger({ component: "expoPushProvider" });

export type PushResult = {
  token: string;
  status: "ok" | "error";
  ticketId?: string;
  error?: string;
};

const expo = new Expo();

/**
 * Sends appointment reminder push notifications to the given Expo push tokens.
 * Messages are chunked per Expo SDK limits (~100 per request).
 *
 * @param tokens - Array of Expo push tokens
 * @param title - Notification title (always "Upcoming appointment")
 * @param body - Notification body from buildReminderText
 * @returns Array of PushResult with token-level status and ticket IDs
 */
export async function sendReminderPush(
  tokens: string[],
  title: string,
  body: string,
): Promise<PushResult[]> {
  if (tokens.length === 0) {
    return [];
  }

  const messages: ExpoPushMessage[] = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: { type: "appointment_reminder" },
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const results: PushResult[] = [];

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);

      for (let i = 0; i < chunk.length; i++) {
        const message = chunk[i];
        if (!message) {
          continue;
        }
        const token = message.to as string;
        const ticket = tickets[i];

        if (!ticket) {
          results.push({ token, status: "error", error: "No ticket returned" });
        } else if (ticket.status === "ok") {
          results.push({ token, status: "ok", ticketId: (ticket as { status: "ok"; id: string }).id });
        } else {
          results.push({
            token,
            status: "error",
            error: (ticket as { status: "error"; message: string }).message,
          });
        }
      }
    } catch (error) {
      logger.error("expo.push.send_failed", {
        errorClass: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });

      // Mark all tokens in this chunk as errored
      for (const msg of chunk) {
        results.push({
          token: msg.to as string,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown push error",
        });
      }
    }
  }

  return results;
}
